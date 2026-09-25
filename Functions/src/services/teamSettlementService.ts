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
 * - **Stripe is read before it is written.** Each refund starts by
 *   retrieving the PaymentIntent, and refunds no more than it still holds. A
 *   payment someone else already refunded is not refunded again.
 * - **Every refund carries an idempotency key** derived from the
 *   PaymentIntent and the amounts, so two settlements racing on the same
 *   payment send Stripe the same request, and Stripe performs it once.
 * - **The ledger records what Stripe says happened**, re-read after each
 *   refund, never what was asked for. If Stripe and the ledger disagree —
 *   a refund issued in the Dashboard, say — the ledger is corrected on the
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
 * Brings a team's money into line with where the team stands: exactly the
 * total kept if it registered, everything refunded if it is out, and
 * otherwise kept — except that a payer who has left an unregistered team is
 * refunded whatever the team is doing.
 *
 * Idempotent, and cheap when there is nothing to do — it reads the season,
 * the team-season and the ledger, and returns.
 *
 * @throws SettlementIncompleteError if any action failed. Every other action
 *   is still attempted first, so one failed refund does not hold up the rest.
 */
export async function settleTeamSeason(
	teamId: string,
	seasonId: string,
	options: { now?: Date; stripe?: Stripe; firestore?: Firestore } = {}
): Promise<SettlementOutcome> {
	const firestore = options.firestore ?? getFirestore()
	const now = options.now ?? new Date()

	const [seasonSnap, teamSeasonSnap, contributionsSnap, rosterSnap] =
		await Promise.all([
			firestore.collection(Collections.SEASONS).doc(seasonId).get(),
			teamSeasonRef(firestore, teamId, seasonId).get(),
			teamContributionsCollection(firestore, teamId, seasonId).get(),
			teamSeasonRef(firestore, teamId, seasonId).collection('roster').get(),
		])
	// Roster entries are keyed by player id.
	const rosterPlayerIds = new Set(rosterSnap.docs.map((doc) => doc.id))

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
			toPlanned(doc.id, doc.data() as TeamContributionDocument, rosterPlayerIds)
		),
		disposition,
		totalCents,
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

	// One at a time, in plan order. Running them in parallel would buy little
	// for a team with a handful of payments.
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
	data: TeamContributionDocument,
	rosterPlayerIds: ReadonlySet<string>
): PlannedContribution {
	return {
		paymentIntentId,
		status: data.status,
		amountCents: data.amountCents,
		// A server timestamp is always set by the time a contribution can be
		// read back; zero only sorts a malformed one first.
		createdAtMillis: data.createdAt?.toMillis?.() ?? 0,
		payerOnRoster: rosterPlayerIds.has(data.player.id),
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
 * Refunds what an action asks for, or as much of it as Stripe still holds,
 * and returns the PaymentIntent as it stands afterwards.
 */
async function applyAction(
	stripe: Stripe,
	action: SettlementAction
): Promise<Stripe.PaymentIntent> {
	const { paymentIntentId } = action
	const before = await retrieveWithCharge(stripe, paymentIntentId)

	const state = contributionStateFromPaymentIntent(before)
	const refundableCents = state?.status === 'paid' ? state.amountCents : 0
	const refundCents = Math.min(action.amountCents, refundableCents)
	if (refundCents <= 0) return before

	await stripe.refunds.create(
		{ payment_intent: paymentIntentId, amount: refundCents },
		{
			// The refundable balance is part of the key so two separate refunds
			// of the same amount stay distinct requests.
			idempotencyKey: `settle_refund_${paymentIntentId}_${refundableCents}_${refundCents}`,
		}
	)
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

export type RefundOutcome =
	| { outcome: 'refunded' }
	| { outcome: 'not-found' }
	| { outcome: 'already-refunded' }
	/**
	 * Stripe did not hold what the ledger claimed — it was refunded in the
	 * Dashboard, say — so nothing was refunded; the ledger now matches Stripe
	 * and the refund can be retried.
	 */
	| { outcome: 'stripe-disagreed'; stripeStatus: string }

/**
 * Refunds one contribution in full, by hand.
 *
 * For an admin resolving something the rules do not cover — a dispute, a
 * test payment, a payer who should not have been charged. It does not touch
 * the team's registration, which is irreversible; refunding money from a
 * registered team leaves it short, and settlement then reports the
 * shortfall.
 *
 * Goes through the same retrieve-then-refund and reconcile as settlement, so
 * a payment already refunded in Stripe is recorded rather than refunded
 * twice.
 */
export async function refundContribution(
	firestore: Firestore,
	stripe: Stripe,
	params: { teamId: string; seasonId: string; paymentIntentId: string }
): Promise<RefundOutcome> {
	const { teamId, seasonId, paymentIntentId } = params
	const snap = await teamContributionsCollection(firestore, teamId, seasonId)
		.doc(paymentIntentId)
		.get()
	if (!snap.exists) return { outcome: 'not-found' }

	const contribution = snap.data() as TeamContributionDocument
	if (contribution.status !== 'paid') return { outcome: 'already-refunded' }

	// Stripe first. If it does not hold what the ledger says, nothing is
	// refunded by this call, and the admin should see that rather than be
	// recorded as having done it.
	const current = await retrieveWithCharge(stripe, paymentIntentId)
	const before = contributionStateFromPaymentIntent(current)
	if (
		before?.status !== 'paid' ||
		before.amountCents !== contribution.amountCents
	) {
		await reconcileContribution(firestore, {
			teamId,
			seasonId,
			paymentIntent: current,
		})
		return { outcome: 'stripe-disagreed', stripeStatus: current.status }
	}

	const paymentIntent = await applyAction(stripe, {
		type: 'refund',
		paymentIntentId,
		amountCents: contribution.amountCents,
	})
	await reconcileContribution(firestore, { teamId, seasonId, paymentIntent })

	return contributionStateFromPaymentIntent(paymentIntent)?.status ===
		'refunded'
		? { outcome: 'refunded' }
		: { outcome: 'stripe-disagreed', stripeStatus: paymentIntent.status }
}
