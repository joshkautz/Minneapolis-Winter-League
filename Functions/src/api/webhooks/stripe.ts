/**
 * Stripe webhook handler
 *
 * Handles Stripe webhook events for payment processing.
 * Creates payment documents in Firestore to trigger the onPaymentCreated flow.
 */

import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG, getStripeConfig } from '../../config/constants.js'
import { handleFunctionError } from '../../shared/errors.js'
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

			// Get the signature header for verification
			const sig = req.headers['stripe-signature']
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
				case 'checkout.session.completed':
					await handleCheckoutSessionCompleted(
						event.data.object as Stripe.Checkout.Session
					)
					break

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
			created: Timestamp.now(),
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
					updated: Timestamp.now(),
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
					updated: Timestamp.now(),
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
