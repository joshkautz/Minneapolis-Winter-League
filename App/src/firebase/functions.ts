import {
	getFunctions,
	httpsCallable,
	HttpsCallableResult,
} from 'firebase/functions'
import { returnTypeT, SignatureRequestGetResponse } from '@dropbox/sign'

import { app } from './app'

const functions = getFunctions(app)

const sendWaiverReminderEmail = async (): Promise<
	HttpsCallableResult<returnTypeT<SignatureRequestGetResponse>>
> => {
	const sendWaiverReminder = httpsCallable<
		unknown,
		returnTypeT<SignatureRequestGetResponse>
	>(functions, 'sendWaiverReminder')
	return sendWaiverReminder()
}

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

export { sendWaiverReminderEmail, createStripeCheckoutSession }
export type { CreateStripeCheckoutRequest, CreateStripeCheckoutResponse }
