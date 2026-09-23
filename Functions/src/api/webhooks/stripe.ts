/**
 * Stripe webhook handler
 *
 * Handles Stripe webhook events for payment processing. A per-player
 * checkout creates a payment document that triggers onPaymentCreated; a team
 * contribution is recorded in the team's contribution ledger instead.
 */

import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG, getStripeConfig } from '../../config/constants.js'
import { handleFunctionError } from '../../shared/errors.js'
import {
	recordContribution,
	TeamSeasonNotFoundError,
} from '../../shared/contributions.js'
import { TEAM_CONTRIBUTION_KIND } from '../../shared/stripe.js'
import { reconcileContribution } from '../../services/teamSettlementService.js'
import type { ContributionStatus } from '../../types.js'
import Stripe from 'stripe'

/**
 * Webhook handler for Stripe events
 *
 * Processes checkout.session.completed events to create payment documents.
 * Optionally handles product/price sync events for admin UI.
 *
 * @see https://stripe.com/docs/webhooks
 */
export const stripeWebhook = onRequest(
	{
		region: FIREBASE_CONFIG.REGION,
		secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
		invoker: 'public',
	},
	async (req, resp) => {
		try {
			logger.info('Received Stripe webhook')

			if (req.method !== 'POST') {
				resp.status(405).send('Method not allowed')
				return
			}

			const stripeConfig = getStripeConfig()
			const stripe = new Stripe(stripeConfig.SECRET_KEY, {
				apiVersion: stripeConfig.API_VERSION,
			})

			// Get the signature header for verification.
			// Stripe v22 tightened the constructEvent signature to accept
			// `string | Uint8Array`, so we collapse the possible array form
			// (which Express types but Stripe never actually sends) here.
			const sigHeader = req.headers['stripe-signature']
			const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader
			if (!sig) {
				logger.error('Missing Stripe signature header')
				resp.status(400).send('Missing signature')
				return
			}

			let event: Stripe.Event
			try {
				// Cloud Functions v2 provides rawBody for webhook handlers
				event = stripe.webhooks.constructEvent(
					req.rawBody,
					sig,
					stripeConfig.WEBHOOK_SECRET
				)
			} catch (err) {
				logger.error('Webhook signature verification failed', { error: err })
				resp.status(401).send('Invalid signature')
				return
			}

			logger.info(`Processing Stripe event: ${event.type}`, {
				eventId: event.id,
			})

			// Handle specific event types
			switch (event.type) {
				case 'checkout.session.completed': {
					const session = event.data.object as Stripe.Checkout.Session
					// A team contribution must never reach the per-player path:
					// that writes stripe/{uid}/payments, and onPaymentCreated
					// would mark the contributor paid as an individual.
					if (session.metadata?.kind === TEAM_CONTRIBUTION_KIND) {
						await handleTeamContributionCompleted(stripe, session)
					} else {
						await handleCheckoutSessionCompleted(session)
					}
					break
				}

				// A team contribution's PaymentIntent changed outside this
				// code — refunded or cancelled in the Dashboard, or a hold that
				// lapsed. Settlement updates the ledger itself; these keep it
				// honest about everything else.
				case 'payment_intent.canceled':
				case 'payment_intent.succeeded':
					await handleTeamPaymentIntentChange(
						stripe,
						(event.data.object as Stripe.PaymentIntent).id
					)
					break

				case 'charge.refunded': {
					const charge = event.data.object as Stripe.Charge
					const paymentIntentId =
						typeof charge.payment_intent === 'string'
							? charge.payment_intent
							: charge.payment_intent?.id
					if (paymentIntentId) {
						await handleTeamPaymentIntentChange(stripe, paymentIntentId)
					}
					break
				}

				case 'product.created':
				case 'product.updated':
				case 'product.deleted':
					await handleProductEvent(
						event.type,
						event.data.object as Stripe.Product
					)
					break

				case 'price.created':
				case 'price.updated':
				case 'price.deleted':
					await handlePriceEvent(event.type, event.data.object as Stripe.Price)
					break

				default:
					logger.info(`Unhandled event type: ${event.type}`)
			}

			resp.status(200).json({ received: true })
		} catch (error) {
			logger.error('Error processing Stripe webhook:', error)
			resp.status(500).send('Internal server error')
		}
	}
)

/**
 * Handle checkout.session.completed event
 *
 * Creates a payment document in Firestore to trigger the onPaymentCreated flow.
 * This replaces the functionality previously provided by the Firebase Stripe Extension.
 */
async function handleCheckoutSessionCompleted(
	session: Stripe.Checkout.Session
): Promise<void> {
	const firestore = getFirestore()
	const firebaseUID = session.metadata?.firebaseUID

	if (!firebaseUID) {
		logger.warn('No Firebase UID in session metadata', {
			sessionId: session.id,
		})
		return
	}

	try {
		// Create payment document in the new structure
		// This triggers the onPaymentCreated function
		const paymentData = {
			sessionId: session.id,
			status: session.payment_status,
			amountTotal: session.amount_total,
			currency: session.currency,
			customerEmail: session.customer_email,
			customerId:
				typeof session.customer === 'string'
					? session.customer
					: session.customer?.id,
			created: FieldValue.serverTimestamp(),
			stripeCreated: Timestamp.fromMillis(session.created * 1000),
			metadata: session.metadata,
		}

		await firestore
			.collection('stripe')
			.doc(firebaseUID)
			.collection('payments')
			.doc(session.id)
			.set(paymentData)

		logger.info(`Created payment document for user: ${firebaseUID}`, {
			sessionId: session.id,
			status: session.payment_status,
		})
	} catch (error) {
		throw handleFunctionError(error, 'handleCheckoutSessionCompleted', {
			sessionId: session.id,
			firebaseUID,
		})
	}
}

/**
 * Handle a completed team contribution checkout.
 *
 * Records the hold in the team's ledger, which in turn recomputes the team's
 * registration. Everything that identifies the team comes from metadata our
 * own callable set; the amount comes from Stripe.
 *
 * Money must never be left held against nothing. If the contribution cannot
 * be attributed — its metadata is incomplete, or the team was deleted while
 * the payer was on the Checkout page — the hold is released on the spot
 * instead of being retried forever against a team that is gone.
 */
async function handleTeamContributionCompleted(
	stripe: Stripe,
	session: Stripe.Checkout.Session
): Promise<void> {
	const paymentIntentId =
		typeof session.payment_intent === 'string'
			? session.payment_intent
			: session.payment_intent?.id

	if (!paymentIntentId) {
		// No PaymentIntent means no money moved.
		logger.warn('Team contribution session has no PaymentIntent', {
			sessionId: session.id,
		})
		return
	}

	const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
		expand: ['latest_charge'],
	})

	const held = heldMoney(paymentIntent)
	if (!held) {
		logger.warn('Team contribution PaymentIntent holds no money', {
			sessionId: session.id,
			paymentIntentId,
			paymentIntentStatus: paymentIntent.status,
		})
		return
	}

	const { firebaseUID, teamId, seasonId } = session.metadata ?? {}
	if (!firebaseUID || !teamId || !seasonId) {
		logger.error('Team contribution is missing its metadata; releasing it', {
			sessionId: session.id,
			paymentIntentId,
			metadata: session.metadata,
		})
		await releaseUnattributableMoney(stripe, paymentIntentId, held.status)
		return
	}

	try {
		const outcome = await recordContribution(getFirestore(), {
			teamId,
			seasonId,
			playerId: firebaseUID,
			paymentIntentId,
			amountCents: held.amountCents,
			status: held.status,
			captureBefore: held.captureBefore,
		})

		logger.info('Team contribution received', {
			teamId,
			seasonId,
			firebaseUID,
			paymentIntentId,
			amountCents: held.amountCents,
			status: held.status,
			outcome,
		})
	} catch (error) {
		if (error instanceof TeamSeasonNotFoundError) {
			logger.warn('Team contribution for a team that no longer exists', {
				teamId,
				seasonId,
				paymentIntentId,
			})
			await releaseUnattributableMoney(stripe, paymentIntentId, held.status)
			return
		}

		throw handleFunctionError(error, 'handleTeamContributionCompleted', {
			sessionId: session.id,
			paymentIntentId,
			teamId,
			seasonId,
		})
	}
}

/**
 * Brings a team contribution's ledger entry into line with its PaymentIntent.
 *
 * Reads the PaymentIntent fresh rather than trusting the event: events can
 * arrive out of order, and only the current state is worth recording.
 * PaymentIntents that are not team contributions — every per-player payment
 * — are ignored, as is one the ledger has not recorded yet, since the
 * checkout completion that records it reads Stripe fresh too.
 */
async function handleTeamPaymentIntentChange(
	stripe: Stripe,
	paymentIntentId: string
): Promise<void> {
	const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
		expand: ['latest_charge'],
	})

	if (paymentIntent.metadata?.kind !== TEAM_CONTRIBUTION_KIND) return

	const { teamId, seasonId } = paymentIntent.metadata
	if (!teamId || !seasonId) {
		logger.error('Team contribution PaymentIntent is missing its metadata', {
			paymentIntentId,
			metadata: paymentIntent.metadata,
		})
		return
	}

	try {
		const outcome = await reconcileContribution(getFirestore(), {
			teamId,
			seasonId,
			paymentIntent,
		})
		logger.info('Reconciled team contribution from Stripe', {
			teamId,
			seasonId,
			paymentIntentId,
			paymentIntentStatus: paymentIntent.status,
			outcome,
		})
	} catch (error) {
		throw handleFunctionError(error, 'handleTeamPaymentIntentChange', {
			paymentIntentId,
			teamId,
			seasonId,
		})
	}
}

/**
 * What a PaymentIntent is actually holding, or null if nothing.
 *
 * A manual-capture PaymentIntent in `requires_capture` is a live hold; one
 * that has `succeeded` has been captured, which does not happen from Checkout
 * with manual capture but is recorded faithfully if it ever does. Read from a
 * fresh retrieve rather than the event, so a webhook redelivered after the
 * money was settled sees it as settled.
 */
function heldMoney(paymentIntent: Stripe.PaymentIntent): {
	status: ContributionStatus
	amountCents: number
	captureBefore: Timestamp | null
} | null {
	const charge =
		typeof paymentIntent.latest_charge === 'object'
			? paymentIntent.latest_charge
			: null

	if (paymentIntent.status === 'requires_capture') {
		const captureBeforeSeconds =
			charge?.payment_method_details?.card?.capture_before

		return {
			status: 'authorized',
			amountCents: paymentIntent.amount_capturable,
			captureBefore:
				typeof captureBeforeSeconds === 'number'
					? Timestamp.fromMillis(captureBeforeSeconds * 1000)
					: null,
		}
	}

	if (paymentIntent.status === 'succeeded') {
		// A refund leaves the PaymentIntent `succeeded`, so what is still held
		// is what was received less what has gone back. Without this, a
		// redelivery after a refund would try to refund it a second time.
		const amountCents =
			paymentIntent.amount_received - (charge?.amount_refunded ?? 0)
		if (amountCents <= 0) return null

		return {
			status: 'captured',
			amountCents,
			captureBefore: null,
		}
	}

	return null
}

/**
 * Gives money back that cannot be attributed to a team.
 *
 * A hold is cancelled, which is free; money already captured is refunded.
 * Idempotency keys make a redelivered webhook repeat the same request rather
 * than issue a second one.
 */
async function releaseUnattributableMoney(
	stripe: Stripe,
	paymentIntentId: string,
	status: ContributionStatus
): Promise<void> {
	if (status === 'authorized') {
		await stripe.paymentIntents.cancel(
			paymentIntentId,
			{ cancellation_reason: 'abandoned' },
			{ idempotencyKey: `release_${paymentIntentId}` }
		)
		logger.info('Released unattributable hold', { paymentIntentId })
		return
	}

	await stripe.refunds.create(
		{ payment_intent: paymentIntentId },
		{ idempotencyKey: `refund_unattributable_${paymentIntentId}` }
	)
	logger.info('Refunded unattributable payment', { paymentIntentId })
}

/**
 * Handle product events for admin UI sync (optional enhancement)
 *
 * Syncs Stripe products to Firestore so admin UI can display them.
 */
async function handleProductEvent(
	eventType: string,
	product: Stripe.Product
): Promise<void> {
	const firestore = getFirestore()

	try {
		const productRef = firestore
			.collection('stripe')
			.doc('products')
			.collection('items')
			.doc(product.id)

		if (eventType === 'product.deleted') {
			await productRef.delete()
			logger.info(`Deleted product: ${product.id}`)
		} else {
			await productRef.set(
				{
					name: product.name,
					description: product.description,
					active: product.active,
					metadata: product.metadata,
					images: product.images,
					updated: FieldValue.serverTimestamp(),
				},
				{ merge: true }
			)
			logger.info(
				`${eventType === 'product.created' ? 'Created' : 'Updated'} product: ${product.id}`
			)
		}
	} catch (error) {
		throw handleFunctionError(error, 'handleProductEvent', {
			productId: product.id,
			eventType,
		})
	}
}

/**
 * Handle price events for admin UI sync (optional enhancement)
 *
 * Syncs Stripe prices to Firestore so admin UI can display them.
 */
async function handlePriceEvent(
	eventType: string,
	price: Stripe.Price
): Promise<void> {
	const firestore = getFirestore()

	try {
		const priceRef = firestore
			.collection('stripe')
			.doc('prices')
			.collection('items')
			.doc(price.id)

		if (eventType === 'price.deleted') {
			await priceRef.delete()
			logger.info(`Deleted price: ${price.id}`)
		} else {
			await priceRef.set(
				{
					productId:
						typeof price.product === 'string'
							? price.product
							: price.product?.id,
					unitAmount: price.unit_amount,
					currency: price.currency,
					active: price.active,
					type: price.type,
					nickname: price.nickname,
					metadata: price.metadata,
					updated: FieldValue.serverTimestamp(),
				},
				{ merge: true }
			)
			logger.info(
				`${eventType === 'price.created' ? 'Created' : 'Updated'} price: ${price.id}`
			)
		}
	} catch (error) {
		throw handleFunctionError(error, 'handlePriceEvent', {
			priceId: price.id,
			eventType,
		})
	}
}
