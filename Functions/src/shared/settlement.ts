/**
 * Deciding what to do with a team's money.
 *
 * Pure, and kept apart from the code that calls Stripe, so every decision
 * about capturing, cancelling and refunding can be tested exhaustively
 * without a payment processor. `services/teamSettlementService.ts` applies a
 * plan; nothing here has side effects.
 *
 * See docs/TEAM_PAYMENTS.md, "Returning money that should not be kept" and
 * "A hold must never be allowed to expire".
 */

import type { ContributionStatus } from '../types.js'

/**
 * What should happen to a team's money as a whole.
 *
 * - `keep`: the team is registered. Take exactly the season's total, oldest
 *   contributions first, and release everything beyond it.
 * - `release`: the team is not going to play — the season filled without it,
 *   or registration closed. Give everything back.
 * - `hold`: still in the running. Leave the holds alone, except any about to
 *   expire, which are captured rather than allowed to lapse.
 */
export type SettlementDisposition = 'keep' | 'release' | 'hold'

export function decideDisposition(state: {
	registered: boolean
	spotsClaimed: number
	spotsAvailable: number
	registrationClosed: boolean
}): SettlementDisposition {
	if (state.registered) return 'keep'
	if (state.spotsClaimed >= state.spotsAvailable || state.registrationClosed) {
		return 'release'
	}
	return 'hold'
}

/** A contribution as the planner sees it. */
export interface PlannedContribution {
	paymentIntentId: string
	status: ContributionStatus
	amountCents: number
	/** When it was recorded; decides who is charged first. */
	createdAtMillis: number
	/** When the authorization lapses, from the charge. Null if unknown. */
	captureBeforeMillis: number | null
}

export type SettlementAction =
	| { type: 'capture'; paymentIntentId: string; amountCents: number }
	| { type: 'cancel'; paymentIntentId: string }
	| { type: 'refund'; paymentIntentId: string; amountCents: number }

export interface SettlementPlan {
	actions: SettlementAction[]
	/**
	 * How far a kept team falls short of the total after the plan. Non-zero
	 * only when a registered team's money was released out from under it —
	 * a hold cancelled by the bank, say — which needs a person to resolve.
	 */
	shortfallCents: number
}

/** Stripe will not charge less than this in USD. */
export const STRIPE_MINIMUM_CHARGE_CENTS = 50

/**
 * How long a card authorization lasts when the charge does not say. Seven
 * days is the online-payment window for the major networks; treating an
 * unknown expiry as that keeps it from being assumed to last forever.
 */
export const DEFAULT_AUTHORIZATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * How close to expiry a hold on a team still in the running is captured.
 * A day, so an hourly sweep gets two dozen chances before it lapses.
 */
export const EXPIRY_CAPTURE_MARGIN_MS = 24 * 60 * 60 * 1000

/** When a hold lapses, using the default window if Stripe did not say. */
export function expiresAtMillis(contribution: PlannedContribution): number {
	return (
		contribution.captureBeforeMillis ??
		contribution.createdAtMillis + DEFAULT_AUTHORIZATION_WINDOW_MS
	)
}

/**
 * Oldest first, with the PaymentIntent id breaking ties so the order is
 * total. Every planner decision that depends on order uses this one, which
 * is what makes two concurrent settlements of the same team agree.
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
 * Keep exactly `totalCents`: capture holds oldest first until the total is
 * reached — the last one partially if it straddles the line — and cancel
 * the rest. Money already captured counts first; if more than the total was
 * somehow captured, the excess is refunded newest first.
 *
 * Oldest first is the fairness rule: whoever committed earliest is charged,
 * and whoever piled on after the team was already covered is released.
 */
function planKeep(
	contributions: PlannedContribution[],
	totalCents: number
): SettlementPlan {
	const ordered = inCommitOrder(contributions)
	const actions: SettlementAction[] = []

	const captured = ordered.filter((c) => c.status === 'captured')
	const capturedCents = captured.reduce((sum, c) => sum + c.amountCents, 0)

	let excessCents = capturedCents - totalCents
	for (const contribution of [...captured].reverse()) {
		if (excessCents <= 0) break
		const refundCents = Math.min(contribution.amountCents, excessCents)
		actions.push({
			type: 'refund',
			paymentIntentId: contribution.paymentIntentId,
			amountCents: refundCents,
		})
		excessCents -= refundCents
	}

	let neededCents = Math.max(0, totalCents - capturedCents)
	for (const contribution of ordered) {
		if (contribution.status !== 'authorized') continue

		const takeCents = Math.min(contribution.amountCents, neededCents)
		if (takeCents < STRIPE_MINIMUM_CHARGE_CENTS) {
			// Nothing left to take, or less than Stripe will charge. Contributions
			// are whole dollars, so the second only arises from a total that is
			// not; the remainder is written off rather than overcharged.
			actions.push({
				type: 'cancel',
				paymentIntentId: contribution.paymentIntentId,
			})
			continue
		}

		actions.push({
			type: 'capture',
			paymentIntentId: contribution.paymentIntentId,
			amountCents: takeCents,
		})
		neededCents -= takeCents
	}

	return {
		actions,
		shortfallCents:
			neededCents >= STRIPE_MINIMUM_CHARGE_CENTS ? neededCents : 0,
	}
}

/** Give everything back: cancel every hold, refund every capture. */
function planRelease(contributions: PlannedContribution[]): SettlementPlan {
	const actions: SettlementAction[] = []
	for (const contribution of inCommitOrder(contributions)) {
		if (contribution.status === 'authorized') {
			actions.push({
				type: 'cancel',
				paymentIntentId: contribution.paymentIntentId,
			})
		} else if (contribution.status === 'captured') {
			actions.push({
				type: 'refund',
				paymentIntentId: contribution.paymentIntentId,
				amountCents: contribution.amountCents,
			})
		}
	}
	return { actions, shortfallCents: 0 }
}

/**
 * For a team still in the running: do to each expiring hold what `keep`
 * would, and leave everything else alone.
 *
 * Planning as `keep` and filtering, rather than capturing every expiring
 * hold outright, means an overpaid team captures only what it would owe and
 * releases the excess, exactly as it would on registering.
 */
function planHold(
	contributions: PlannedContribution[],
	totalCents: number,
	nowMillis: number
): SettlementPlan {
	const expiring = new Set(
		contributions
			.filter(
				(c) =>
					c.status === 'authorized' &&
					expiresAtMillis(c) <= nowMillis + EXPIRY_CAPTURE_MARGIN_MS
			)
			.map((c) => c.paymentIntentId)
	)
	// Only holds are ever expiring, and `keep` only refunds captures, so this
	// filter also keeps a team still in the running from being refunded.
	const { actions } = planKeep(contributions, totalCents)
	return {
		actions: actions.filter((action) => expiring.has(action.paymentIntentId)),
		shortfallCents: 0,
	}
}

export function planSettlement(params: {
	contributions: PlannedContribution[]
	disposition: SettlementDisposition
	totalCents: number
	nowMillis: number
}): SettlementPlan {
	const { contributions, disposition, totalCents, nowMillis } = params
	switch (disposition) {
		case 'keep':
			return planKeep(contributions, totalCents)
		case 'release':
			return planRelease(contributions)
		case 'hold':
			return planHold(contributions, totalCents, nowMillis)
	}
}

/**
 * The fields of a Stripe PaymentIntent the ledger is reconciled from. A
 * structural subset, so this module needs no Stripe import.
 */
export interface PaymentIntentState {
	status: string
	amount_capturable: number
	amount_received: number
	/** Expanded charge, when retrieved with `expand: ['latest_charge']`. */
	latest_charge?: string | { amount_refunded?: number } | null
}

/**
 * What the ledger should say about a PaymentIntent, read from Stripe's own
 * state rather than from what we asked it to do. Null for states that hold
 * no settled outcome yet (still being confirmed, say), which the ledger
 * leaves alone.
 */
export function contributionStateFromPaymentIntent(
	paymentIntent: PaymentIntentState
): { status: ContributionStatus; amountCents?: number } | null {
	switch (paymentIntent.status) {
		case 'requires_capture':
			return {
				status: 'authorized',
				amountCents: paymentIntent.amount_capturable,
			}
		case 'succeeded': {
			const charge =
				typeof paymentIntent.latest_charge === 'object'
					? paymentIntent.latest_charge
					: null
			const refundedCents = charge?.amount_refunded ?? 0
			const netCents = paymentIntent.amount_received - refundedCents
			return netCents > 0
				? { status: 'captured', amountCents: netCents }
				: { status: 'refunded', amountCents: paymentIntent.amount_received }
		}
		case 'canceled':
			return { status: 'canceled' }
		default:
			return null
	}
}
