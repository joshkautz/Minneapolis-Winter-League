/**
 * Payment-related operations (Stripe integration)
 *
 * Uses a callable Firebase function to create Stripe checkout sessions.
 * This provides better security, simpler error handling, and aligns with
 * the established patterns in the codebase.
 */

import { User } from '../auth'
import { createStripeCheckoutSession } from '../functions'

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
 * and redirects the user to the Stripe checkout page.
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

	try {
		const result = await createStripeCheckoutSession({
			priceId: options.priceId,
			couponId: options.couponId,
			successUrl: buildPaymentReturnUrl('success'),
			cancelUrl: buildPaymentReturnUrl('cancel'),
		})

		// Redirect to Stripe checkout
		window.location.assign(result.data.url)
	} catch (error) {
		setStripeLoading(false)

		// Extract error message from Firebase Functions error
		let errorMessage = 'Failed to create checkout session'
		if (error instanceof Error) {
			// Firebase Functions errors have a 'message' property
			errorMessage = error.message
		}

		setStripeError(errorMessage)
	}
}
