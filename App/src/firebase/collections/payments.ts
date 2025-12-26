/**
 * Payment-related Firestore operations (Stripe integration)
 */

import {
	addDoc,
	collection,
	onSnapshot,
	type DocumentReference,
} from 'firebase/firestore'

import { firestore } from '../app'
import { User } from '../auth'
import { CheckoutSessionDocument } from '@/shared/utils'

/**
 * Options for creating a Stripe checkout session
 */
export interface StripeRegistrationOptions {
	/** Stripe Price ID for the registration fee */
	priceId: string
	/** Optional coupon ID to auto-apply (e.g., returning player discount) */
	couponId?: string
}

/**
 * Creates a Stripe checkout session for winter league registration
 *
 * @param authValue - The authenticated user
 * @param setStripeLoading - State setter for loading state
 * @param setStripeError - State setter for error messages
 * @param options - Stripe checkout configuration (price ID and optional coupon)
 */
export const stripeRegistration = async (
	authValue: User | null | undefined,
	setStripeLoading: React.Dispatch<React.SetStateAction<boolean>>,
	setStripeError: React.Dispatch<React.SetStateAction<string | undefined>>,
	options: StripeRegistrationOptions
) => {
	setStripeLoading(true)

	// Build the checkout session document
	const checkoutSessionData: Record<string, unknown> = {
		mode: 'payment',
		price: options.priceId,
		success_url: window.location.href,
		cancel_url: window.location.href,
	}

	// Auto-apply coupon if provided (e.g., returning player discount)
	// Note: Stripe doesn't allow both discounts AND allow_promotion_codes
	if (options.couponId) {
		checkoutSessionData.discounts = [{ coupon: options.couponId }]
	} else {
		// Only allow manual promo codes if no coupon is auto-applied
		checkoutSessionData.allow_promotion_codes = true
	}

	// Create new Checkout Session for the player
	return (
		addDoc(
			collection(firestore, `customers/${authValue?.uid}/checkout_sessions`),
			checkoutSessionData
		) as Promise<DocumentReference<CheckoutSessionDocument>>
	).then((checkoutSessionDocumentReference) => {
		// Listen for the URL of the Checkout Session
		onSnapshot(
			checkoutSessionDocumentReference,
			(checkoutSessionDocumentSnapshot) => {
				const data = checkoutSessionDocumentSnapshot.data()
				if (data) {
					if (data.url) {
						// We have a Stripe Checkout URL, let's redirect.
						window.location.assign(data.url)
					}
					if (data.error) {
						setStripeLoading(false)
						setStripeError(data.error.message)
					}
				}
			}
		)
	})
}
