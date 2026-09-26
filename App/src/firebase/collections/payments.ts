/**
 * Payment-related operations (Stripe integration)
 *
 * Sends a payer to Stripe Checkout and back. The callables that create the
 * sessions are wrapped in `./functions`.
 */

import { User } from '../auth'
import {
	cancelTeamContributionCheckoutViaFunction,
	createStripeCheckoutViaFunction,
	createTeamContributionCheckoutViaFunction,
} from './functions'
import { logger, errorMessage } from '@/shared/utils'

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
		const result = await createStripeCheckoutViaFunction({
			priceId: options.priceId,
			couponId: options.couponId,
			successUrl: buildPaymentReturnUrl('success'),
			cancelUrl: buildPaymentReturnUrl('cancel'),
		})

		// Redirect to Stripe checkout
		window.location.assign(result.url)
	} catch (error) {
		setStripeLoading(false)

		setStripeError(
			errorMessage(error, 'Checkout could not be opened. Please try again.')
		)
	}
}

/**
 * Opens Stripe Checkout for a contribution to the signed-in player's team,
 * and redirects to it. The server decides which team from the player's
 * roster, and checks the amount against what the team still owes.
 *
 * Resolves to null once the browser is on its way to Stripe, or to a
 * message fit to show the payer if Checkout could not be opened.
 */
export const startTeamContribution = async (
	amountCents: number
): Promise<string | null> => {
	try {
		const result = await createTeamContributionCheckoutViaFunction({
			amountCents,
			successUrl: buildPaymentReturnUrl('success'),
			cancelUrl: buildPaymentReturnUrl('cancel'),
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		})
		window.location.assign(result.url)
		return null
	} catch (error) {
		return errorMessage(error, 'Could not start the payment. Please try again.')
	}
}

/**
 * Frees the amount the signed-in player's checkout reserved, after they came
 * back from Stripe without paying. Best effort: if it fails, the
 * reservation still ends when the session times out.
 */
export const cancelTeamContribution = async (): Promise<void> => {
	try {
		await cancelTeamContributionCheckoutViaFunction()
	} catch (error) {
		logger.error('Could not release a cancelled team checkout', error)
	}
}
