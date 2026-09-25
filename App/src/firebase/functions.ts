import {
	getFunctions,
	httpsCallable,
	HttpsCallableResult,
} from 'firebase/functions'

import { app } from './app'

const functions = getFunctions(app)

interface CreateStripeCheckoutRequest {
	priceId: string
	couponId?: string
	successUrl: string
	cancelUrl: string
}

interface CreateStripeCheckoutResponse {
	success: true
	url: string
	sessionId: string
}

/**
 * Creates a Stripe checkout session and returns the checkout URL
 */
const createStripeCheckoutSession = async (
	request: CreateStripeCheckoutRequest
): Promise<HttpsCallableResult<CreateStripeCheckoutResponse>> => {
	const createStripeCheckout = httpsCallable<
		CreateStripeCheckoutRequest,
		CreateStripeCheckoutResponse
	>(functions, 'createStripeCheckout')
	return createStripeCheckout(request)
}

interface CreateTeamContributionCheckoutRequest {
	/** Proposed amount in cents; the server checks it against the balance. */
	amountCents: number
	successUrl: string
	cancelUrl: string
	timezone?: string
}

/**
 * Creates a Checkout session for a contribution to the caller's own team.
 * The team is decided by the server from the caller's roster, not passed in.
 */
const createTeamContributionCheckoutSession = async (
	request: CreateTeamContributionCheckoutRequest
): Promise<HttpsCallableResult<CreateStripeCheckoutResponse>> => {
	const createTeamContributionCheckout = httpsCallable<
		CreateTeamContributionCheckoutRequest,
		CreateStripeCheckoutResponse
	>(functions, 'createTeamContributionCheckout')
	return createTeamContributionCheckout(request)
}

/**
 * Closes the caller's open team contribution checkout, so the amount it
 * reserved is free for teammates again straight away. Called when the payer
 * comes back from Stripe without paying.
 */
const cancelTeamContributionCheckoutSession = async (): Promise<
	HttpsCallableResult<{ success: true; closed: number }>
> => {
	const cancelTeamContributionCheckout = httpsCallable<
		Record<string, never>,
		{ success: true; closed: number }
	>(functions, 'cancelTeamContributionCheckout')
	return cancelTeamContributionCheckout({})
}

export {
	cancelTeamContributionCheckoutSession,
	createStripeCheckoutSession,
	createTeamContributionCheckoutSession,
}
export type {
	CreateStripeCheckoutRequest,
	CreateStripeCheckoutResponse,
	CreateTeamContributionCheckoutRequest,
}
