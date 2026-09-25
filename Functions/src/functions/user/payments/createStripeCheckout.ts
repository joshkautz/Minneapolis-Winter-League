/**
 * Create Stripe checkout session callable function
 *
 * Creates a Stripe checkout session for season registration payment.
 * Returns the checkout URL for the frontend to redirect to.
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must not be banned for the current season
 * - Registration must be open (between registrationStart and registrationEnd)
 * - Admins bypass registration date and banned restrictions
 * - Return URLs must be on one of the league's own origins, so the checkout
 *   cannot be used as an open redirect
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import {
	validateAuthentication,
	validateNotBanned,
} from '../../../shared/auth.js'
import { getCurrentSeason } from '../../../shared/database.js'
import { isAllowedReturnUrl } from '../../../shared/returnUrls.js'
import {
	createStripeClient,
	getOrCreateStripeCustomer,
} from '../../../shared/stripe.js'
import { Collections, PlayerDocument, SeasonDocument } from '../../../types.js'
import { formatDateForUser } from '../../../shared/format.js'
import type Stripe from 'stripe'

interface CreateStripeCheckoutRequest {
	priceId: string
	couponId?: string
	successUrl: string
	cancelUrl: string
	timezone?: string
}

interface CreateStripeCheckoutResponse {
	success: true
	url: string
	sessionId: string
}

export const createStripeCheckout = onCall<
	CreateStripeCheckoutRequest,
	Promise<CreateStripeCheckoutResponse>
>(
	{
		region: FIREBASE_CONFIG.REGION,
		secrets: ['STRIPE_SECRET_KEY'],
	},
	async (request) => {
		const { auth, data } = request
		const userId = auth?.uid ?? ''

		// Validate authentication
		validateAuthentication(auth)

		const { priceId, couponId, successUrl, cancelUrl, timezone } = data

		// Validate required fields
		if (!priceId || !successUrl || !cancelUrl) {
			throw new HttpsError(
				'invalid-argument',
				'Price ID, success URL, and cancel URL are required'
			)
		}

		if (!isAllowedReturnUrl(successUrl) || !isAllowedReturnUrl(cancelUrl)) {
			throw new HttpsError(
				'invalid-argument',
				'Success and cancel URLs must point back to this site'
			)
		}

		try {
			const firestore = getFirestore()

			// Fetch player doc, current season, and auth user in parallel for performance
			const [playerDoc, currentSeason, userRecord] = await Promise.all([
				firestore.collection(Collections.PLAYERS).doc(userId).get(),
				getCurrentSeason() as Promise<(SeasonDocument & { id: string }) | null>,
				getAuth().getUser(userId),
			])

			const playerData = playerDoc.data() as PlayerDocument | undefined
			const isAdmin = playerData?.admin === true

			// Validate player is not banned for current season (skip for admins)
			if (!isAdmin && currentSeason) {
				await validateNotBanned(firestore, userId)
			}

			// Validate registration is open (skip for admins)
			if (!isAdmin) {
				if (!currentSeason) {
					throw new HttpsError('failed-precondition', 'No current season found')
				}

				const now = new Date()
				const registrationStart = currentSeason.registrationStart.toDate()
				const registrationEnd = currentSeason.registrationEnd.toDate()

				if (now < registrationStart) {
					throw new HttpsError(
						'failed-precondition',
						`Registration has not opened yet. Registration opens ${formatDateForUser(registrationStart, timezone)}.`
					)
				}

				if (now > registrationEnd) {
					throw new HttpsError(
						'failed-precondition',
						`Registration has closed. Registration ended ${formatDateForUser(registrationEnd, timezone)}.`
					)
				}
			}

			const stripe = createStripeClient()
			const customer = await getOrCreateStripeCustomer(firestore, stripe, {
				userId,
				email: userRecord.email,
			})

			// Stripe v22's published types stopped re-exporting
			// `Stripe.Checkout.SessionCreateParams` from the package root, so
			// derive the parameter type from the runtime client method.
			type CheckoutSessionCreateParams = Parameters<
				Stripe['checkout']['sessions']['create']
			>[0]
			const sessionParams: CheckoutSessionCreateParams = {
				customer,
				mode: 'payment',
				line_items: [
					{
						price: priceId,
						quantity: 1,
					},
				],
				success_url: successUrl,
				cancel_url: cancelUrl,
				metadata: {
					firebaseUID: userId,
				},
			}

			// Add discounts if coupon provided, otherwise allow promo codes
			if (couponId) {
				sessionParams.discounts = [{ coupon: couponId }]
			} else {
				sessionParams.allow_promotion_codes = true
			}

			// Create Stripe checkout session with idempotency key
			// Key is based on user + price + time window (1 minute) to prevent duplicates on retry
			// while allowing legitimate new checkout attempts
			const timeWindow = Math.floor(Date.now() / 60000) // 1-minute window
			const idempotencyKey = `checkout_${userId}_${priceId}_${timeWindow}`

			const stripeSession = await stripe.checkout.sessions.create(
				sessionParams,
				{ idempotencyKey }
			)

			if (!stripeSession.url) {
				throw new HttpsError(
					'internal',
					'Checkout could not be opened. Please try again.'
				)
			}

			logger.info(`Created Stripe checkout session for user: ${userId}`, {
				sessionId: stripeSession.id,
			})

			return {
				success: true,
				url: stripeSession.url,
				sessionId: stripeSession.id,
			}
		} catch (error) {
			// Re-throw HttpsErrors directly
			if (error instanceof HttpsError) {
				throw error
			}

			logger.error('Error creating Stripe checkout session:', {
				userId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new HttpsError(
				'internal',
				'Checkout could not be opened. Please try again.'
			)
		}
	}
)
