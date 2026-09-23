/**
 * Stripe helpers shared by the checkout callables and the webhook.
 */

import type { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import Stripe from 'stripe'
import { getStripeConfig } from '../config/constants.js'

/** Stripe client pinned to the API version the code was written against. */
export function createStripeClient(): Stripe {
	const stripeConfig = getStripeConfig()
	return new Stripe(stripeConfig.SECRET_KEY, {
		apiVersion: stripeConfig.API_VERSION,
	})
}

/**
 * Checkout's `metadata.kind` for a team contribution. The webhook branches on
 * it, so it must never be sent by the per-player checkout.
 */
export const TEAM_CONTRIBUTION_KIND = 'team_contribution'

/**
 * The Product every team contribution is sold as.
 *
 * A fixed id rather than one looked up by name, so it can be created on first
 * use without a Dashboard step and without two concurrent callers each
 * creating their own. Inline prices attach to it per session; it is what the
 * payer sees on the receipt.
 */
export const TEAM_REGISTRATION_PRODUCT_ID = 'mwl_team_registration'

interface StripeErrorShape {
	type?: string
	code?: string
}

function isStripeError(error: unknown, code: string): boolean {
	const stripeError = error as StripeErrorShape | null
	return (
		stripeError?.type === 'StripeInvalidRequestError' &&
		stripeError?.code === code
	)
}

/**
 * Returns the caller's Stripe customer id, creating the customer on first
 * use.
 *
 * The mapping lives at `stripe/{uid}.stripeId`. A stored id whose customer has
 * since been deleted in Stripe is replaced rather than reused, since Checkout
 * would reject it.
 */
export async function getOrCreateStripeCustomer(
	firestore: Firestore,
	stripe: Stripe,
	params: { userId: string; email: string | undefined }
): Promise<string> {
	const { userId, email } = params
	const customerDocRef = firestore.collection('stripe').doc(userId)

	return firestore.runTransaction(async (transaction) => {
		const customerDoc = await transaction.get(customerDocRef)
		const customerData = customerDoc.data()

		if (customerData?.stripeId) {
			try {
				await stripe.customers.retrieve(customerData.stripeId)
				logger.info(`Using existing Stripe customer: ${customerData.stripeId}`)
				return customerData.stripeId as string
			} catch (stripeError: unknown) {
				if (!isStripeError(stripeError, 'resource_missing')) {
					throw stripeError
				}
				logger.info(
					`Stripe customer ${customerData.stripeId} not found, creating new one`
				)
			}
		}

		// The transaction can retry; the idempotency key keeps a retry from
		// creating a second customer.
		logger.info(`Creating new Stripe customer for ${userId}`)
		const newCustomer = await stripe.customers.create(
			{
				email,
				metadata: {
					firebaseUID: userId,
				},
			},
			{ idempotencyKey: `customer_${userId}` }
		)

		transaction.set(
			customerDocRef,
			{
				stripeId: newCustomer.id,
				email,
			},
			{ merge: true }
		)

		logger.info(`Created new Stripe customer: ${newCustomer.id}`)
		return newCustomer.id
	})
}

/**
 * Set once the Product is known to exist, so a warm instance does not
 * re-check it on every checkout during a registration rush.
 */
let teamRegistrationProductConfirmed = false

/**
 * Makes sure the team registration Product exists, creating it if not.
 *
 * Two instances can both find it missing and both try to create it; the
 * loser's `resource_already_exists` means the other one won, which is fine.
 */
export async function ensureTeamRegistrationProduct(
	stripe: Stripe
): Promise<void> {
	if (teamRegistrationProductConfirmed) return

	try {
		await stripe.products.retrieve(TEAM_REGISTRATION_PRODUCT_ID)
	} catch (retrieveError: unknown) {
		if (!isStripeError(retrieveError, 'resource_missing')) {
			throw retrieveError
		}

		try {
			await stripe.products.create({
				id: TEAM_REGISTRATION_PRODUCT_ID,
				name: 'Team Registration',
				description:
					'A contribution toward a team’s registration in the Minneapolis Winter League.',
			})
			logger.info(`Created Stripe product ${TEAM_REGISTRATION_PRODUCT_ID}`)
		} catch (createError: unknown) {
			if (!isStripeError(createError, 'resource_already_exists')) {
				throw createError
			}
		}
	}

	teamRegistrationProductConfirmed = true
}

/** Test seam: forget that the Product was confirmed. */
export function resetTeamRegistrationProductCache(): void {
	teamRegistrationProductConfirmed = false
}
