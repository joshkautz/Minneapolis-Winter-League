import { describe, expect, it } from 'vitest'
import {
	contributionStateFromPaymentIntent,
	decideDisposition,
	planSettlement,
	type PlannedContribution,
	type SettlementDisposition,
} from './settlement.js'

/**
 * Every decision about a team's money, tested without a payment processor.
 *
 * Every contribution is charged when it is made, so the only decision is
 * what to refund. The cases that matter most are the ones that cost a payer
 * money if wrong: the overpayment race (keep the total, refund the rest), a
 * team that misses out (refund everyone), and a payer who left the team.
 */

const TOTAL = 100_000
const HOUR = 60 * 60 * 1000
const START = Date.UTC(2030, 0, 10)

let sequence = 0
const contribution = (
	amountCents: number,
	overrides: Partial<PlannedContribution> = {}
): PlannedContribution => {
	sequence += 1
	return {
		paymentIntentId: `pi_${String(sequence).padStart(3, '0')}`,
		status: 'paid',
		amountCents,
		createdAtMillis: START + sequence * HOUR,
		payerOnRoster: true,
		...overrides,
	}
}

const leaver = (amountCents: number) =>
	contribution(amountCents, { payerOnRoster: false })

const refund = (c: PlannedContribution, amountCents = c.amountCents) => ({
	type: 'refund',
	paymentIntentId: c.paymentIntentId,
	amountCents,
})

const plan = (
	contributions: PlannedContribution[],
	disposition: SettlementDisposition,
	totalCents = TOTAL
) => planSettlement({ contributions, disposition, totalCents })

describe('decideDisposition', () => {
	const state = {
		registered: false,
		spotsClaimed: 3,
		spotsAvailable: 12,
		registrationClosed: false,
	}

	it('keeps the money of a registered team', () => {
		expect(decideDisposition({ ...state, registered: true })).toBe('keep')
	})

	it('keeps a registered team’s money even once the season is full', () => {
		expect(
			decideDisposition({ ...state, registered: true, spotsClaimed: 12 })
		).toBe('keep')
	})

	it('keeps a registered team’s money after registration closes', () => {
		expect(
			decideDisposition({
				...state,
				registered: true,
				registrationClosed: true,
			})
		).toBe('keep')
	})

	it('refunds an unregistered team once every spot is taken', () => {
		expect(decideDisposition({ ...state, spotsClaimed: 12 })).toBe('refund')
	})

	it('refunds an unregistered team once registration closes', () => {
		expect(decideDisposition({ ...state, registrationClosed: true })).toBe(
			'refund'
		)
	})

	it('waits while an unregistered team is still in the running', () => {
		expect(decideDisposition(state)).toBe('pending')
	})
})

describe('keep', () => {
	it('keeps a single payment of exactly the total', () => {
		expect(plan([contribution(TOTAL)], 'keep')).toEqual({
			actions: [],
			shortfallCents: 0,
		})
	})

	it('keeps every payment of an exact split', () => {
		const split = [
			contribution(50_000),
			contribution(30_000),
			contribution(20_000),
		]
		expect(plan(split, 'keep').actions).toEqual([])
	})

	it('refunds the part of the payment that crosses the total', () => {
		const first = contribution(70_000)
		const second = contribution(50_000)

		expect(plan([first, second], 'keep').actions).toEqual([
			refund(second, 20_000),
		])
	})

	it('refunds a whole payment made after the team was covered', () => {
		const first = contribution(TOTAL)
		const late = contribution(30_000)

		expect(plan([first, late], 'keep').actions).toEqual([refund(late)])
	})

	it('keeps the earliest payers, whatever order they are listed in', () => {
		const early = contribution(60_000)
		const middle = contribution(60_000)
		const late = contribution(60_000)

		expect(plan([late, middle, early], 'keep').actions).toEqual([
			refund(middle, 20_000),
			refund(late),
		])
	})

	it('breaks a tie in time by PaymentIntent id, so every run agrees', () => {
		const a = contribution(TOTAL, {
			paymentIntentId: 'pi_a',
			createdAtMillis: START,
		})
		const b = contribution(TOTAL, {
			paymentIntentId: 'pi_b',
			createdAtMillis: START,
		})

		expect(plan([b, a], 'keep').actions).toEqual([refund(b)])
		expect(plan([a, b], 'keep').actions).toEqual([refund(b)])
	})

	it('ignores payments that have already been refunded', () => {
		const refunded = contribution(TOTAL, { status: 'refunded' })
		const paid = contribution(TOTAL)

		expect(plan([refunded, paid], 'keep')).toEqual({
			actions: [],
			shortfallCents: 0,
		})
	})

	it('counts what is left of a partly refunded payment', () => {
		// $800 paid and $300 of it refunded by hand leaves $500 held.
		const partlyRefunded = contribution(50_000)
		const second = contribution(70_000)

		expect(plan([partlyRefunded, second], 'keep').actions).toEqual([
			refund(second, 20_000),
		])
	})

	it('reports a shortfall when a registered team no longer has the money', () => {
		// Refunded by an admin after the team registered; registration stands.
		expect(plan([contribution(40_000)], 'keep')).toEqual({
			actions: [],
			shortfallCents: 60_000,
		})
	})

	it('never refunds more than a team paid over its total', () => {
		const payments = [contribution(90_000), contribution(90_000)]
		const refunded = plan(payments, 'keep').actions.reduce(
			(sum, a) => sum + a.amountCents,
			0
		)
		expect(refunded).toBe(80_000)
	})
})

describe('refund', () => {
	it('refunds every payment in full', () => {
		const a = contribution(60_000)
		const b = contribution(40_000)

		expect(plan([b, a], 'refund')).toEqual({
			actions: [refund(a), refund(b)],
			shortfallCents: 0,
		})
	})

	it('does nothing once everything is refunded', () => {
		expect(
			plan([contribution(TOTAL, { status: 'refunded' })], 'refund').actions
		).toEqual([])
	})
})

describe('pending', () => {
	it('keeps the money of a team still in the running', () => {
		expect(
			plan([contribution(60_000), contribution(60_000)], 'pending').actions
		).toEqual([])
	})

	it('keeps an overpayment until the team registers', () => {
		// Which payment is the excess depends on the order they are kept in,
		// which is only final once the team is in.
		expect(
			plan([contribution(TOTAL), contribution(TOTAL)], 'pending').actions
		).toEqual([])
	})
})

describe('a payer who has left the team', () => {
	it('is refunded in full before the team registers', () => {
		const gone = leaver(40_000)
		const stays = contribution(30_000)

		expect(plan([gone, stays], 'pending').actions).toEqual([refund(gone)])
	})

	it('is refunded with everyone else when the team misses out', () => {
		const gone = leaver(40_000)
		const stays = contribution(30_000)

		expect(plan([gone, stays], 'refund').actions).toEqual([
			refund(gone),
			refund(stays),
		])
	})

	describe('once the team is registered', () => {
		it('is refunded when the team still on it covers the total', () => {
			// Left before the team registered: registration never counted them.
			const gone = leaver(40_000)
			const stays = contribution(TOTAL)

			expect(plan([gone, stays], 'keep').actions).toEqual([refund(gone)])
		})

		it('comes after the team, however early they paid', () => {
			const gone = leaver(60_000)
			const stays = contribution(60_000)

			expect(plan([gone, stays], 'keep').actions).toEqual([
				refund(gone, 20_000),
			])
		})

		it('keeps their money when it secured the spot', () => {
			// Left after the team registered. Registration is final; the team
			// must not be left short.
			expect(plan([leaver(TOTAL)], 'keep')).toEqual({
				actions: [],
				shortfallCents: 0,
			})
		})
	})
})

describe('contributionStateFromPaymentIntent', () => {
	it('reads a payment', () => {
		expect(
			contributionStateFromPaymentIntent({
				status: 'succeeded',
				amount_received: 50_000,
				latest_charge: { amount_refunded: 0 },
			})
		).toEqual({ status: 'paid', amountCents: 50_000 })
	})

	it('nets out a partial refund', () => {
		expect(
			contributionStateFromPaymentIntent({
				status: 'succeeded',
				amount_received: 50_000,
				latest_charge: { amount_refunded: 20_000 },
			})
		).toEqual({ status: 'paid', amountCents: 30_000 })
	})

	it('reads a full refund, keeping what was paid', () => {
		expect(
			contributionStateFromPaymentIntent({
				status: 'succeeded',
				amount_received: 50_000,
				latest_charge: { amount_refunded: 50_000 },
			})
		).toEqual({ status: 'refunded', amountCents: 50_000 })
	})

	it('treats an unexpanded charge as nothing refunded', () => {
		expect(
			contributionStateFromPaymentIntent({
				status: 'succeeded',
				amount_received: 50_000,
				latest_charge: 'ch_123',
			})
		).toEqual({ status: 'paid', amountCents: 50_000 })
	})

	it.each(['requires_payment_method', 'processing', 'canceled'])(
		'records nothing for a PaymentIntent that is %s',
		(status) => {
			expect(
				contributionStateFromPaymentIntent({ status, amount_received: 0 })
			).toBeNull()
		}
	)
})
