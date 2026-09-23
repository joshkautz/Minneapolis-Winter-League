/**
 * Settling a team's money with Stripe.
 *
 * `shared/settlement.ts` decides what should happen; this applies it. The
 * split keeps the decisions testable without a payment processor and this
 * layer thin enough to cover with a fake one.
 *
 * Every step is safe to repeat, because it will be: the triggers that call
 * this are retried on failure, several can settle the same team at once, and
 * Stripe redelivers webhooks.
 *
 * - **Stripe is read before it is written.** Each action starts by
 *   retrieving the PaymentIntent, and does nothing unless it is still in the
 *   state the action needs. A hold someone else already captured is not
 *   captured again.
 * - **Every write carries an idempotency key** derived from the PaymentIntent
 *   and the amount, so two settlements racing on the same hold send Stripe
 *   the same request, and Stripe performs it once.
 * - **The ledger records what Stripe says happened**, re-read after each
 *   action, never what was asked for. If Stripe and the ledger disagree —
 *   a hold cancelled in the Dashboard, say — the ledger is corrected on the
 *   next settlement.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import type Stripe from 'stripe'
import { TEAM_CONFIG } from '../config/constants.js'
import {
	Collections,
	type SeasonDocument,
	type TeamContributionDocument,
	type TeamSeasonDocument,
} from '../types.js'
import {
	ContributionNotFoundError,
	setContributionStatus,
	teamContributionsCollection,
} from '../shared/contributions.js'
import { teamSeasonRef } from '../shared/database.js'
import {
	contributionStateFromPaymentIntent,
	decideDisposition,
	planSettlement,
	type PlannedContribution,
	type SettlementAction,
	type SettlementDisposition,
} from '../shared/settlement.js'
import { createStripeClient } from '../shared/stripe.js'

export type SettlementOutcome =
	| { outcome: 'not-team-payments' }
	| { outcome: 'no-team-season' }
	| {
			outcome: 'settled'
			disposition: SettlementDisposition
			actionsApplied: number
			shortfallCents: number
	  }

/** Thrown when one or more actions failed, after every action was tried. */
export class SettlementIncompleteError extends Error {
	constructor(
		readonly teamId: string,
		readonly seasonId: string,
		readonly failures: { paymentIntentId: string; message: string }[]
	) {
		super(
			`Settlement of teams/${teamId}/teamSeasons/${seasonId} left ${failures.length} ` +
				`contribution(s) unsettled: ` +
				failures.map((f) => `${f.paymentIntentId} (${f.message})`).join('; ')
		)
		this.name = 'SettlementIncompleteError'
	}
}

/**
 * Brings a team's money into line with where the team stands: captured if it
 * registered, released if it is out, held if it is still in the running.
 *
 * Idempotent, and cheap when there is nothing to do — it reads the season,
 * the team-season and the ledger, and returns.
 *
 * @throws SettlementIncompleteError if any action failed. Every other action
 *   is still attempted first, so one bad card does not hold up the rest.
 */
export async function settleTeamSeason(
	teamId: string,
	seasonId: string,
	options: { now?: Date; stripe?: Stripe; firestore?: Firestore } = {}
): Promise<SettlementOutcome> {
	const firestore = options.firestore ?? getFirestore()
	const now = options.now ?? new Date()

	const [seasonSnap, teamSeasonSnap, contributionsSnap] = await Promise.all([
		firestore.collection(Collections.SEASONS).doc(seasonId).get(),
		teamSeasonRef(firestore, teamId, seasonId).get(),
		teamContributionsCollection(firestore, teamId, seasonId).get(),
	])

	const season = seasonSnap.data() as SeasonDocument | undefined
	const totalCents = season?.teamRegistrationTotalCents
	if (typeof totalCents !== 'number') {
		return { outcome: 'not-team-payments' }
	}

	if (!teamSeasonSnap.exists) {
		return { outcome: 'no-team-season' }
	}
	const teamSeason = teamSeasonSnap.data() as TeamSeasonDocument

	const disposition = decideDisposition({
		registered: teamSeason.registered === true,
		spotsClaimed: season?.registeredTeamCount ?? 0,
		spotsAvailable: TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK,
		registrationClosed:
			season?.registrationEnd !== undefined &&
			now.getTime() > season.registrationEnd.toMillis(),
	})

	const plan = planSettlement({
		contributions: contributionsSnap.docs.map((doc) =>
			toPlanned(doc.id, doc.data() as TeamContributionDocument)
		),
		disposition,
		totalCents,
		nowMillis: now.getTime(),
	})

	if (plan.shortfallCents > 0) {
		// Registration stands regardless; this is for a person to chase.
		logger.error('Registered team is short of its total', {
			teamId,
			seasonId,
			shortfallCents: plan.shortfallCents,
		})
	}

	if (plan.actions.length === 0) {
		return {
			outcome: 'settled',
			disposition,
			actionsApplied: 0,
			shortfallCents: plan.shortfallCents,
		}
	}

	const stripe = options.stripe ?? createStripeClient()
	const failures: { paymentIntentId: string; message: string }[] = []
	let actionsApplied = 0

	// One at a time, in plan order. Captures come oldest first, and running
	// them in parallel would buy little for a team with a handful of holds.
	for (const action of plan.actions) {
		try {
			const paymentIntent = await applyAction(stripe, action)
			await reconcileContribution(firestore, {
				teamId,
				seasonId,
				paymentIntent,
			})
			actionsApplied += 1
		} catch (error) {
			failures.push({
				paymentIntentId: action.paymentIntentId,
				message: error instanceof Error ? error.message : String(error),
			})
		}
	}

	logger.info('Settled team contributions', {
		teamId,
		seasonId,
		disposition,
		planned: plan.actions.length,
		actionsApplied,
		failed: failures.length,
	})

	if (failures.length > 0) {
		throw new SettlementIncompleteError(teamId, seasonId, failures)
	}

	return {
		outcome: 'settled',
		disposition,
		actionsApplied,
		shortfallCents: plan.shortfallCents,
	}
}

function toPlanned(
	paymentIntentId: string,
	data: TeamContributionDocument
): PlannedContribution {
	return {
		paymentIntentId,
		status: data.status,
		amountCents: data.amountCents,
		// A server timestamp is always set by the time a contribution can be
		// read back; zero only sorts a malformed one first.
		createdAtMillis: data.createdAt?.toMillis?.() ?? 0,
		captureBeforeMillis: data.captureBefore?.toMillis?.() ?? null,
	}
}

async function retrieveWithCharge(
	stripe: Stripe,
	paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
	return stripe.paymentIntents.retrieve(paymentIntentId, {
		expand: ['latest_charge'],
	})
}

/**
 * Applies one action, if Stripe's current state still calls for it, and
 * returns the PaymentIntent as it stands afterwards.
 */
async function applyAction(
	stripe: Stripe,
	action: SettlementAction
): Promise<Stripe.PaymentIntent> {
	const { paymentIntentId } = action
	const before = await retrieveWithCharge(stripe, paymentIntentId)

	switch (action.type) {
		case 'capture':
			if (before.status !== 'requires_capture') return before
			await stripe.paymentIntents.capture(
				paymentIntentId,
				{ amount_to_capture: action.amountCents },
				{
					idempotencyKey: `settle_capture_${paymentIntentId}_${action.amountCents}`,
				}
			)
			break

		case 'cancel':
			if (before.status !== 'requires_capture') return before
			await stripe.paymentIntents.cancel(
				paymentIntentId,
				{ cancellation_reason: 'abandoned' },
				{ idempotencyKey: `settle_cancel_${paymentIntentId}` }
			)
			break

		case 'refund': {
			if (before.status !== 'succeeded') return before
			const state = contributionStateFromPaymentIntent(before)
			const refundableCents =
				state?.status === 'captured' ? (state.amountCents ?? 0) : 0
			const refundCents = Math.min(action.amountCents, refundableCents)
			if (refundCents <= 0) return before
			await stripe.refunds.create(
				{ payment_intent: paymentIntentId, amount: refundCents },
				{
					// The refundable balance is part of the key so two separate
					// refunds of the same amount stay distinct requests.
					idempotencyKey: `settle_refund_${paymentIntentId}_${refundableCents}_${refundCents}`,
				}
			)
			break
		}
	}

	return retrieveWithCharge(stripe, paymentIntentId)
}

/**
 * Makes a contribution's ledger entry match its PaymentIntent.
 *
 * Shared by settlement and by the webhook, which calls it when Stripe
 * reports a change made outside this code.
 *
 * @returns 'missing' when the ledger has no such contribution, which is not
 *   an error: a PaymentIntent event can outrun the checkout completion that
 *   records it, and that completion reads Stripe fresh.
 */
export async function reconcileContribution(
	firestore: Firestore,
	params: {
		teamId: string
		seasonId: string
		paymentIntent: Parameters<typeof contributionStateFromPaymentIntent>[0] & {
			id: string
		}
	}
): Promise<'updated' | 'unchanged' | 'missing' | 'unsettled'> {
	const { teamId, seasonId, paymentIntent } = params
	const state = contributionStateFromPaymentIntent(paymentIntent)
	if (!state) return 'unsettled'

	try {
		return await setContributionStatus(firestore, {
			teamId,
			seasonId,
			paymentIntentId: paymentIntent.id,
			status: state.status,
			amountCents: state.amountCents,
		})
	} catch (error) {
		if (error instanceof ContributionNotFoundError) return 'missing'
		throw error
	}
}

export type ReleaseOutcome =
	| { outcome: 'released'; status: 'canceled' | 'refunded' }
	| { outcome: 'not-found' }
	| { outcome: 'already-settled'; status: TeamContributionDocument['status'] }
	/**
	 * Stripe was not in the state the ledger claimed, so nothing was
	 * released; the ledger now matches Stripe and the release can be retried.
	 */
	| { outcome: 'stripe-disagreed'; stripeStatus: string }

/**
 * Gives back one contribution by hand: cancels it if it is still a hold,
 * refunds it if it was captured.
 *
 * For an admin resolving something the rules do not cover — a dispute, a
 * payer who left the team before it registered. It does not touch the
 * team's registration, which is irreversible; releasing money from a
 * registered team leaves it short, and settlement then reports the
 * shortfall.
 *
 * Goes through the same retrieve-then-act and reconcile as settlement, so a
 * contribution already settled in Stripe is recorded rather than acted on
 * twice.
 */
export async function releaseContribution(
	firestore: Firestore,
	stripe: Stripe,
	params: { teamId: string; seasonId: string; paymentIntentId: string }
): Promise<ReleaseOutcome> {
	const { teamId, seasonId, paymentIntentId } = params
	const snap = await teamContributionsCollection(firestore, teamId, seasonId)
		.doc(paymentIntentId)
		.get()
	if (!snap.exists) return { outcome: 'not-found' }

	const contribution = snap.data() as TeamContributionDocument
	if (
		contribution.status !== 'authorized' &&
		contribution.status !== 'captured'
	) {
		return { outcome: 'already-settled', status: contribution.status }
	}

	// Stripe first. If the money is not where the ledger says — a hold the
	// bank already let go — nothing is released by this call, and the admin
	// should see that rather than be recorded as having done it.
	const current = await retrieveWithCharge(stripe, paymentIntentId)
	if (
		contributionStateFromPaymentIntent(current)?.status !== contribution.status
	) {
		await reconcileContribution(firestore, {
			teamId,
			seasonId,
			paymentIntent: current,
		})
		return { outcome: 'stripe-disagreed', stripeStatus: current.status }
	}

	const action: SettlementAction =
		contribution.status === 'authorized'
			? { type: 'cancel', paymentIntentId }
			: {
					type: 'refund',
					paymentIntentId,
					amountCents: contribution.amountCents,
				}

	const paymentIntent = await applyAction(stripe, action)
	await reconcileContribution(firestore, { teamId, seasonId, paymentIntent })

	const state = contributionStateFromPaymentIntent(paymentIntent)
	if (state?.status === 'canceled' || state?.status === 'refunded') {
		return { outcome: 'released', status: state.status }
	}
	return { outcome: 'stripe-disagreed', stripeStatus: paymentIntent.status }
}
