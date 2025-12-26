/**
 * Stripe checkout session creation Firebase Function
 *
 * Listens for checkout session document creation and creates a Stripe checkout session
 * Updates the document with the checkout URL, session ID, timestamp, and client info
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG, getStripeConfig } from '../../config/constants.js'
import { handleFunctionError } from '../../shared/errors.js'
import Stripe from 'stripe'

/**
 * When a checkout session document is created, create the actual Stripe checkout session
 * and update the document with the URL and session details
 */
export const onCheckoutSessionCreated = onDocumentCreated(
	{
		document: 'stripe/{uid}/checkouts/{checkoutId}',
		region: FIREBASE_CONFIG.REGION,
		secrets: ['STRIPE_SECRET_KEY'],
	},
	async (event) => {
		const { uid, checkoutId } = event.params
		const checkoutSessionData = event.data?.data()

		if (!checkoutSessionData) {
			logger.error('No checkout session data found', { uid, checkoutId })
			return
		}

		try {
			logger.info(
				`Creating Stripe checkout session for user: ${uid}, session: ${checkoutId}`
			)

			const firestore = getFirestore()
			const stripeConfig = getStripeConfig()
			const stripe = new Stripe(stripeConfig.SECRET_KEY, {
				apiVersion: stripeConfig.API_VERSION,
			})

			// Extract required fields from the checkout session document
			const {
				mode = 'payment',
				price,
				success_url,
				cancel_url,
				client = 'web',
				quantity = 1,
				metadata = {},
				discounts,
				allow_promotion_codes,
			} = checkoutSessionData

			// Validate required fields
			if (!price || !success_url || !cancel_url) {
				throw new Error(
					'Missing required checkout session fields: price, success_url, or cancel_url'
				)
			}

			// Get or create Stripe customer
			let customer: string | undefined
			const customerDocRef = firestore.collection('stripe').doc(uid)
			const customerDoc = await customerDocRef.get()
			const customerData = customerDoc.data()

			// Get Firebase Auth user info for customer creation
			const userRecord = await import('firebase-admin/auth').then((auth) =>
				auth.getAuth().getUser(uid)
			)

			if (customerData?.stripeId) {
				// Verify the customer exists in Stripe, create new one if not
				try {
					await stripe.customers.retrieve(customerData.stripeId)
					customer = customerData.stripeId
					logger.info(
						`Using existing Stripe customer: ${customerData.stripeId}`
					)
				} catch (stripeError: unknown) {
					const error = stripeError as { type?: string; code?: string }
					if (
						error?.type === 'StripeInvalidRequestError' &&
						error?.code === 'resource_missing'
					) {
						// Customer doesn't exist in Stripe (common in test environment)
						logger.info(
							`Stripe customer ${customerData.stripeId} not found, creating new one for ${uid}`
						)

						const newCustomer = await stripe.customers.create({
							email: userRecord.email,
							metadata: {
								firebaseUID: uid,
							},
						})

						// Update the customer document with the new Stripe ID
						await customerDocRef.set(
							{
								stripeId: newCustomer.id,
								email: userRecord.email,
							},
							{ merge: true }
						)

						customer = newCustomer.id
						logger.info(`Created new Stripe customer: ${newCustomer.id}`)
					} else {
						// Other Stripe error, re-throw
						throw stripeError
					}
				}
			} else {
				// No Stripe ID in Firestore, create a new customer
				logger.info(`No Stripe customer found for ${uid}, creating new one`)

				const newCustomer = await stripe.customers.create({
					email: userRecord.email,
					metadata: {
						firebaseUID: uid,
					},
				})

				// Update the customer document with the Stripe ID
				await customerDocRef.set(
					{
						stripeId: newCustomer.id,
						email: userRecord.email,
					},
					{ merge: true }
				)

				customer = newCustomer.id
				logger.info(`Created new Stripe customer: ${newCustomer.id}`)
			}

			// Create Stripe checkout session
			const sessionParams: Stripe.Checkout.SessionCreateParams = {
				customer,
				mode: mode as Stripe.Checkout.SessionCreateParams.Mode,
				line_items: [
					{
						price,
						quantity,
					},
				],
				success_url,
				cancel_url,
				metadata: {
					...metadata,
					firebaseUID: uid,
					checkoutId,
				},
			}

			// Add discounts if provided (mutually exclusive with allow_promotion_codes)
			if (discounts && Array.isArray(discounts) && discounts.length > 0) {
				sessionParams.discounts = discounts
			} else if (allow_promotion_codes) {
				sessionParams.allow_promotion_codes = true
			}

			const stripeSession = await stripe.checkout.sessions.create(
				sessionParams,
				{ idempotencyKey: checkoutId } // Use document ID for idempotency
			)

			// Update the Firestore document with Stripe session details
			await event.data?.ref.set(
				{
					client,
					mode,
					sessionId: stripeSession.id,
					url: stripeSession.url,
					created: Timestamp.now(),
				},
				{ merge: true }
			)

			logger.info(
				`Successfully created Stripe checkout session for user: ${uid}`,
				{
					sessionId: stripeSession.id,
					url: stripeSession.url,
				}
			)
		} catch (error) {
			logger.error('Failed to create checkout session', {
				uid,
				checkoutId,
				error,
			})

			// Update document with error information
			await event.data?.ref.set(
				{
					error: {
						message:
							error instanceof Error ? error.message : 'Unknown error occurred',
					},
				},
				{ merge: true }
			)

			throw handleFunctionError(error, 'onCheckoutSessionCreated', {
				uid,
				checkoutId,
			})
		}
	}
)
