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
import { Collections } from '../../types.js'
import { handleFunctionError } from '../../shared/errors.js'
import {
	createStripeClient,
	TEAM_CONTRIBUTION_KIND,
} from '../../shared/stripe.js'
import { reconcileContribution } from '../../services/teamSettlementService.js'
import { recordContributionFromStripe } from '../../services/teamContributionIntake.js'
import Stripe from 'stripe'

/**
 * Webhook handler for Stripe events
 *
 * Processes completed checkouts and refunds. Any other event is acknowledged
 * and ignored.
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
			const stripe = createStripeClient()

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

				// A team contribution was refunded outside this code — in the
				// Dashboard, say. Settlement updates the ledger for its own
				// refunds; this keeps it honest about everyone else's.
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
 * Handle a completed per-player registration checkout.
 *
 * Creates `stripe/{uid}/payments/{sessionId}`, which triggers
 * onPaymentCreated. Team contributions never reach here.
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
		// The payment document triggers onPaymentCreated, which marks the
		// player paid for the season.
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
			.collection(Collections.STRIPE)
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
 * Records the payment in the team's ledger, which in turn recomputes the
 * team's registration — or refunds it, if it cannot be attributed. See
 * services/teamContributionIntake.ts.
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

	try {
		await recordContributionFromStripe(getFirestore(), stripe, {
			paymentIntent,
			metadata: session.metadata,
		})
	} catch (error) {
		throw handleFunctionError(error, 'handleTeamContributionCompleted', {
			sessionId: session.id,
			paymentIntentId,
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
