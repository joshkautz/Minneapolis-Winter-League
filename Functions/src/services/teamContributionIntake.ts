/**
 * Taking a Stripe PaymentIntent into the team contribution ledger.
 *
 * Two routes lead here: the checkout completion webhook, which is how a
 * contribution normally arrives, and the daily reconciliation, which finds
 * any hold the webhook missed. Both must do exactly the same thing, so it
 * lives here rather than in either.
 *
 * Money must never be left held against nothing. If a PaymentIntent cannot
 * be attributed — its metadata is incomplete, or its team was deleted while
 * the payer was on the Checkout page — the money is released on the spot
 * instead of being retried forever against a team that is gone.
 */

import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import type Stripe from 'stripe'
import type { ContributionStatus } from '../types.js'
import {
	recordContribution,
	TeamSeasonNotFoundError,
} from '../shared/contributions.js'

export type IntakeOutcome =
	'recorded' | 'already-recorded' | 'holds-no-money' | 'released-unattributable'

/**
 * Records a team contribution from its PaymentIntent, or releases it.
 *
 * `metadata` is what our own callable set when it created the Checkout
 * session; nothing in it comes from the payer. The amount and state are
 * read from the PaymentIntent, which the caller must have retrieved with
 * `expand: ['latest_charge']` so the hold's expiry is known.
 */
export async function recordContributionFromStripe(
	firestore: Firestore,
	stripe: Stripe,
	params: {
		paymentIntent: Stripe.PaymentIntent
		metadata: Record<string, string> | null | undefined
	}
): Promise<IntakeOutcome> {
	const { paymentIntent, metadata } = params
	const paymentIntentId = paymentIntent.id

	const held = heldMoney(paymentIntent)
	if (!held) {
		logger.warn('Team contribution PaymentIntent holds no money', {
			paymentIntentId,
			paymentIntentStatus: paymentIntent.status,
		})
		return 'holds-no-money'
	}

	const { firebaseUID, teamId, seasonId } = metadata ?? {}
	if (!firebaseUID || !teamId || !seasonId) {
		logger.error('Team contribution is missing its metadata; releasing it', {
			paymentIntentId,
			metadata,
		})
		await releaseUnattributableMoney(stripe, paymentIntentId, held.status)
		return 'released-unattributable'
	}

	try {
		const outcome = await recordContribution(firestore, {
			teamId,
			seasonId,
			playerId: firebaseUID,
			paymentIntentId,
			amountCents: held.amountCents,
			status: held.status,
			captureBefore: held.captureBefore,
		})

		logger.info('Team contribution received', {
			teamId,
			seasonId,
			firebaseUID,
			paymentIntentId,
			amountCents: held.amountCents,
			status: held.status,
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
			await releaseUnattributableMoney(stripe, paymentIntentId, held.status)
			return 'released-unattributable'
		}
		throw error
	}
}

/**
 * What a PaymentIntent is actually holding, or null if nothing.
 *
 * A manual-capture PaymentIntent in `requires_capture` is a live hold; one
 * that has `succeeded` has been captured, which does not happen from Checkout
 * with manual capture but is recorded faithfully if it ever does. Read from a
 * fresh retrieve rather than the event, so a webhook redelivered after the
 * money was settled sees it as settled.
 */
function heldMoney(paymentIntent: Stripe.PaymentIntent): {
	status: ContributionStatus
	amountCents: number
	captureBefore: Timestamp | null
} | null {
	const charge =
		typeof paymentIntent.latest_charge === 'object'
			? paymentIntent.latest_charge
			: null

	if (paymentIntent.status === 'requires_capture') {
		const captureBeforeSeconds =
			charge?.payment_method_details?.card?.capture_before

		return {
			status: 'authorized',
			amountCents: paymentIntent.amount_capturable,
			captureBefore:
				typeof captureBeforeSeconds === 'number'
					? Timestamp.fromMillis(captureBeforeSeconds * 1000)
					: null,
		}
	}

	if (paymentIntent.status === 'succeeded') {
		// A refund leaves the PaymentIntent `succeeded`, so what is still held
		// is what was received less what has gone back. Without this, a
		// redelivery after a refund would try to refund it a second time.
		const amountCents =
			paymentIntent.amount_received - (charge?.amount_refunded ?? 0)
		if (amountCents <= 0) return null

		return {
			status: 'captured',
			amountCents,
			captureBefore: null,
		}
	}

	return null
}

/**
 * Gives money back that cannot be attributed to a team.
 *
 * A hold is cancelled, which is free; money already captured is refunded.
 * Idempotency keys make a redelivered webhook repeat the same request rather
 * than issue a second one.
 */
async function releaseUnattributableMoney(
	stripe: Stripe,
	paymentIntentId: string,
	status: ContributionStatus
): Promise<void> {
	if (status === 'authorized') {
		await stripe.paymentIntents.cancel(
			paymentIntentId,
			{ cancellation_reason: 'abandoned' },
			{ idempotencyKey: `release_${paymentIntentId}` }
		)
		logger.info('Released unattributable hold', { paymentIntentId })
		return
	}

	await stripe.refunds.create(
		{ payment_intent: paymentIntentId },
		{ idempotencyKey: `refund_unattributable_${paymentIntentId}` }
	)
	logger.info('Refunded unattributable payment', { paymentIntentId })
}
