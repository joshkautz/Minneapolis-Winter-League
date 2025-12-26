/**
 * Payment-related Firestore operations (Stripe integration)
 */

import {
	addDoc,
	collection,
	onSnapshot,
	type DocumentReference,
	type Unsubscribe,
} from 'firebase/firestore'

import { firestore } from '../app'
import { User } from '../auth'
import { CheckoutSessionDocument } from '@/shared/utils'

/** Timeout for waiting for checkout URL (30 seconds) */
const CHECKOUT_TIMEOUT_MS = 30000

/**
 * Builds a URL with payment status query parameter
 */
function buildPaymentReturnUrl(status: 'success' | 'cancel'): string {
	const url = new URL(window.location.href)
	// Remove any existing payment params
	url.searchParams.delete('payment')
	// Add the new status
	url.searchParams.set('payment', status)
	return url.toString()
}

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
): Promise<void> => {
	if (!authValue?.uid) {
		setStripeError('You must be logged in to register')
		return
	}

	setStripeLoading(true)
	setStripeError(undefined)

	let unsubscribe: Unsubscribe | undefined
	let timeoutId: ReturnType<typeof setTimeout> | undefined

	// Cleanup function to prevent memory leaks
	const cleanup = () => {
		if (unsubscribe) {
			unsubscribe()
			unsubscribe = undefined
		}
		if (timeoutId) {
			clearTimeout(timeoutId)
			timeoutId = undefined
		}
	}

	try {
		// Build the checkout session document
		const checkoutSessionData: Record<string, unknown> = {
			mode: 'payment',
			price: options.priceId,
			success_url: buildPaymentReturnUrl('success'),
			cancel_url: buildPaymentReturnUrl('cancel'),
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
		const checkoutSessionDocRef = (await addDoc(
			collection(firestore, `stripe/${authValue.uid}/checkouts`),
			checkoutSessionData
		)) as DocumentReference<CheckoutSessionDocument>

		// Set up timeout for checkout URL
		timeoutId = setTimeout(() => {
			cleanup()
			setStripeLoading(false)
			setStripeError(
				'Checkout is taking longer than expected. Please try again.'
			)
		}, CHECKOUT_TIMEOUT_MS)

		// Listen for the URL of the Checkout Session
		unsubscribe = onSnapshot(
			checkoutSessionDocRef,
			(checkoutSessionDocumentSnapshot) => {
				const data = checkoutSessionDocumentSnapshot.data()
				if (data) {
					if (data.url) {
						// We have a Stripe Checkout URL, clean up and redirect
						cleanup()
						window.location.assign(data.url)
					}
					if (data.error) {
						// Error occurred, clean up and show error
						cleanup()
						setStripeLoading(false)
						setStripeError(
							data.error.message || 'An error occurred during checkout'
						)
					}
				}
			},
			(error) => {
				// Snapshot listener error
				cleanup()
				setStripeLoading(false)
				setStripeError(error.message || 'Failed to connect to payment service')
			}
		)
	} catch (error) {
		// Error creating the checkout session document
		cleanup()
		setStripeLoading(false)
		setStripeError(
			error instanceof Error
				? error.message
				: 'Failed to create checkout session'
		)
	}
}
