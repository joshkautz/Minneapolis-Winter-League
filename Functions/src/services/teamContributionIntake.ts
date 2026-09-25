/**
 * Taking a Stripe PaymentIntent into the team contribution ledger.
 *
 * Two routes lead here: the checkout completion webhook, which is how a
 * contribution normally arrives, and the daily reconciliation, which finds
 * any payment the webhook missed. Both must do exactly the same thing, so it
 * lives here rather than in either.
 *
 * Money must never be left paid toward nothing. If a PaymentIntent cannot be
 * attributed — its metadata is incomplete, or its team was deleted while the
 * payer was on the Checkout page — it is refunded on the spot instead of
 * being retried forever against a team that is gone.
 */

import type { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import type Stripe from 'stripe'
import {
	recordContribution,
	TeamSeasonNotFoundError,
} from '../shared/contributions.js'
import { contributionStateFromPaymentIntent } from '../shared/settlement.js'
import { removeReservation } from '../shared/checkoutReservations.js'

export type IntakeOutcome =
	'recorded' | 'already-recorded' | 'not-paid' | 'refunded-unattributable'

/**
 * Records a team contribution from its PaymentIntent, or refunds it, and
 * ends the reservation its checkout held.
 *
 * `metadata` is what our own callable set when it created the Checkout
 * session; nothing in it comes from the payer. The amount is read from the
 * PaymentIntent, which the caller must have retrieved with
 * `expand: ['latest_charge']` so any refund is netted out.
 */
export async function recordContributionFromStripe(
	firestore: Firestore,
	stripe: Stripe,
	params: {
		paymentIntent: Stripe.PaymentIntent
		metadata: Record<string, string> | null | undefined
	}
): Promise<IntakeOutcome> {
	const outcome = await takeIn(firestore, stripe, params)

	// Whatever became of the money, the checkout that reserved it is over.
	// After the ledger write, so the amount is never counted by neither.
	const { teamId, seasonId, reservationId } = params.metadata ?? {}
	if (teamId && seasonId && reservationId) {
		await removeReservation(firestore, { teamId, seasonId, reservationId })
	}
	return outcome
}

async function takeIn(
	firestore: Firestore,
	stripe: Stripe,
	params: {
		paymentIntent: Stripe.PaymentIntent
		metadata: Record<string, string> | null | undefined
	}
): Promise<IntakeOutcome> {
	const { paymentIntent, metadata } = params
	const paymentIntentId = paymentIntent.id

	// Read from a fresh retrieve rather than the event, so a webhook
	// redelivered after the payment was refunded sees it as refunded. A
	// refund leaves the PaymentIntent `succeeded`, so this nets it out.
	const state = contributionStateFromPaymentIntent(paymentIntent)
	if (state?.status !== 'paid') {
		logger.warn('Team contribution PaymentIntent holds no money', {
			paymentIntentId,
			paymentIntentStatus: paymentIntent.status,
		})
		return 'not-paid'
	}

	const { firebaseUID, teamId, seasonId } = metadata ?? {}
	if (!firebaseUID || !teamId || !seasonId) {
		logger.error('Team contribution is missing its metadata; refunding it', {
			paymentIntentId,
			metadata,
		})
		await refundUnattributableMoney(stripe, paymentIntentId)
		return 'refunded-unattributable'
	}

	try {
		const outcome = await recordContribution(firestore, {
			teamId,
			seasonId,
			playerId: firebaseUID,
			paymentIntentId,
			amountCents: state.amountCents,
		})

		logger.info('Team contribution received', {
			teamId,
			seasonId,
			firebaseUID,
			paymentIntentId,
			amountCents: state.amountCents,
			outcome,
		})
		return outcome
	} catch (error) {
		if (error instanceof TeamSeasonNotFoundError) {
			logger.warn('Team contribution for a team that no longer exists', {
				teamId,
				seasonId,
				paymentIntentId,
			})
			await refundUnattributableMoney(stripe, paymentIntentId)
			return 'refunded-unattributable'
		}
		throw error
	}
}

/**
 * Gives back money that cannot be attributed to a team. The idempotency key
 * makes a redelivered webhook repeat the same request rather than issue a
 * second refund.
 */
async function refundUnattributableMoney(
	stripe: Stripe,
	paymentIntentId: string
): Promise<void> {
	await stripe.refunds.create(
		{ payment_intent: paymentIntentId },
		{ idempotencyKey: `refund_unattributable_${paymentIntentId}` }
	)
	logger.info('Refunded unattributable payment', { paymentIntentId })
}
