/**
 * Deciding what to do with a team's money.
 *
 * Every contribution is charged when the payer completes Checkout, so the
 * only thing settlement ever does is refund: a team that misses out, the part
 * of a team's money beyond its total, a payer who left before the team
 * registered. Deciding which is pure, and kept apart from the code that calls
 * Stripe, so every decision can be tested exhaustively without a payment
 * processor. `services/teamSettlementService.ts` applies a plan; nothing here
 * has side effects.
 *
 * See docs/TEAM_PAYMENTS.md, "Returning money that should not be kept".
 */

import type { ContributionStatus } from '../types.js'

/**
 * What should happen to a team's money as a whole.
 *
 * - `keep`: the team is registered. Keep exactly the season's total and
 *   refund anything beyond it.
 * - `refund`: the team is not going to play — the season filled without it,
 *   or registration closed. Refund everything.
 * - `pending`: still in the running. Keep it, except what a payer who has
 *   left put in.
 */
export type SettlementDisposition = 'keep' | 'refund' | 'pending'

export function decideDisposition(state: {
	registered: boolean
	spotsClaimed: number
	spotsAvailable: number
	registrationClosed: boolean
}): SettlementDisposition {
	if (state.registered) return 'keep'
	if (state.spotsClaimed >= state.spotsAvailable || state.registrationClosed) {
		return 'refund'
	}
	return 'pending'
}

/** A contribution as the planner sees it. */
export interface PlannedContribution {
	paymentIntentId: string
	status: ContributionStatus
	/** What the team still holds of it. */
	amountCents: number
	/** When it was recorded; decides whose money a team keeps. */
	createdAtMillis: number
	/**
	 * Whether the payer is still on the team's roster. An unregistered team
	 * refunds a leaver; a registered team keeps a leaver's money only if the
	 * people still on it do not cover the total.
	 */
	payerOnRoster: boolean
}

export interface SettlementAction {
	type: 'refund'
	paymentIntentId: string
	amountCents: number
}

export interface SettlementPlan {
	actions: SettlementAction[]
	/**
	 * How far a registered team falls short of its total after the plan.
	 * Non-zero only when money was refunded out from under it — by an admin,
	 * or in the Stripe Dashboard — which needs a person to resolve.
	 */
	shortfallCents: number
}

/**
 * Oldest first, with the PaymentIntent id breaking ties so the order is
 * total. Every decision that depends on order uses this, which is what makes
 * two concurrent settlements of the same team agree.
 */
function inCommitOrder(
	contributions: PlannedContribution[]
): PlannedContribution[] {
	return [...contributions].sort(
		(a, b) =>
			a.createdAtMillis - b.createdAtMillis ||
			a.paymentIntentId.localeCompare(b.paymentIntentId)
	)
}

/**
 * The order a registered team keeps money in: the people still on it, oldest
 * first, then anyone who has left, oldest first.
 *
 * Registration counts only the current roster's money, so a payer who left
 * before the team registered is never needed and is refunded. One who left
 * after it registered was part of what secured the spot; their money is kept
 * only for whatever the rest of the team does not cover.
 */
function inKeepOrder(
	contributions: PlannedContribution[]
): PlannedContribution[] {
	return [
		...inCommitOrder(contributions.filter((c) => c.payerOnRoster)),
		...inCommitOrder(contributions.filter((c) => !c.payerOnRoster)),
	]
}

const paidOnly = (
	contributions: PlannedContribution[]
): PlannedContribution[] =>
	contributions.filter((c) => c.status === 'paid' && c.amountCents > 0)

/**
 * Keep exactly `totalCents`, in keep order, and refund the rest — the
 * payment that crosses the total partly.
 *
 * Oldest first is the fairness rule: whoever paid earliest keeps their
 * payment, and whoever paid after the team was already covered is refunded.
 */
function planKeep(
	contributions: PlannedContribution[],
	totalCents: number
): SettlementPlan {
	const actions: SettlementAction[] = []
	let neededCents = totalCents

	for (const contribution of inKeepOrder(paidOnly(contributions))) {
		const keptCents = Math.min(contribution.amountCents, neededCents)
		neededCents -= keptCents
		const refundCents = contribution.amountCents - keptCents
		if (refundCents > 0) {
			actions.push({
				type: 'refund',
				paymentIntentId: contribution.paymentIntentId,
				amountCents: refundCents,
			})
		}
	}

	return { actions, shortfallCents: neededCents }
}

/** Refund everything the team holds. */
function planRefundAll(
	contributions: PlannedContribution[]
): SettlementAction[] {
	return inCommitOrder(paidOnly(contributions)).map((contribution) => ({
		type: 'refund',
		paymentIntentId: contribution.paymentIntentId,
		amountCents: contribution.amountCents,
	}))
}

/**
 * Plans what to do with a team's money.
 *
 * Before a team registers, a payer who has left is refunded in full: they
 * are not charged for a team they are no longer on, and registration has
 * already stopped counting it. Once it has registered, registration is
 * final, so their money is kept last rather than refunded outright (see
 * `inKeepOrder`).
 */
export function planSettlement(params: {
	contributions: PlannedContribution[]
	disposition: SettlementDisposition
	totalCents: number
}): SettlementPlan {
	const { contributions, disposition, totalCents } = params
	switch (disposition) {
		case 'keep':
			return planKeep(contributions, totalCents)
		case 'refund':
			return { actions: planRefundAll(contributions), shortfallCents: 0 }
		case 'pending':
			return {
				actions: planRefundAll(contributions.filter((c) => !c.payerOnRoster)),
				shortfallCents: 0,
			}
	}
}

/**
 * The fields of a Stripe PaymentIntent the ledger is reconciled from. A
 * structural subset, so this module needs no Stripe import.
 */
export interface PaymentIntentState {
	status: string
	amount_received: number
	/** Expanded charge, when retrieved with `expand: ['latest_charge']`. */
	latest_charge?: string | { amount_refunded?: number } | null
}

/**
 * What the ledger should say about a PaymentIntent, read from Stripe's own
 * state rather than from what we asked it to do. Null for a PaymentIntent
 * that has not been paid, which the ledger leaves alone.
 */
export function contributionStateFromPaymentIntent(
	paymentIntent: PaymentIntentState
): { status: ContributionStatus; amountCents: number } | null {
	if (paymentIntent.status !== 'succeeded') return null

	const charge =
		typeof paymentIntent.latest_charge === 'object'
			? paymentIntent.latest_charge
			: null
	const refundedCents = charge?.amount_refunded ?? 0
	const netCents = paymentIntent.amount_received - refundedCents
	return netCents > 0
		? { status: 'paid', amountCents: netCents }
		: { status: 'refunded', amountCents: paymentIntent.amount_received }
}
