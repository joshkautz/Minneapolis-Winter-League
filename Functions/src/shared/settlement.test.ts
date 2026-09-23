import { describe, expect, it } from 'vitest'
import {
	contributionStateFromPaymentIntent,
	decideDisposition,
	DEFAULT_AUTHORIZATION_WINDOW_MS,
	EXPIRY_CAPTURE_MARGIN_MS,
	planSettlement,
	type PlannedContribution,
	type SettlementDisposition,
} from './settlement.js'

/**
 * Every decision about a team's money, tested without a payment processor.
 *
 * The cases that matter most are the ones that cost money if wrong: the
 * overpayment race (capture part, release the rest), a team that loses the
 * race (release everything, and a release is free only if it is a cancel),
 * and a hold that would otherwise expire unnoticed.
 */

const TOTAL = 100_000
const NOW = Date.UTC(2030, 0, 10)
const HOUR = 60 * 60 * 1000

let sequence = 0
const contribution = (
	amountCents: number,
	status: PlannedContribution['status'] = 'authorized',
	overrides: Partial<PlannedContribution> = {}
): PlannedContribution => {
	sequence += 1
	return {
		paymentIntentId: `pi_${String(sequence).padStart(3, '0')}`,
		status,
		amountCents,
		createdAtMillis: NOW - 60 * HOUR + sequence,
		// Comfortably unexpired unless a test says otherwise.
		captureBeforeMillis: NOW + 5 * 24 * HOUR,
		...overrides,
	}
}

const plan = (
	contributions: PlannedContribution[],
	disposition: SettlementDisposition,
	totalCents = TOTAL
) => planSettlement({ contributions, disposition, totalCents, nowMillis: NOW })

describe('decideDisposition', () => {
	const base = {
		registered: false,
		spotsClaimed: 5,
		spotsAvailable: 12,
		registrationClosed: false,
	}

	it('keeps the money of a registered team', () => {
		expect(decideDisposition({ ...base, registered: true })).toBe('keep')
	})

	it('keeps a registered team’s money even once the season is full', () => {
		// The team is one of the twelve. Filling up is what releases the others.
		expect(
			decideDisposition({ ...base, registered: true, spotsClaimed: 12 })
		).toBe('keep')
	})

	it('keeps a registered team’s money after registration closes', () => {
		expect(
			decideDisposition({ ...base, registered: true, registrationClosed: true })
		).toBe('keep')
	})

	it('releases an unregistered team once every spot is taken', () => {
		expect(decideDisposition({ ...base, spotsClaimed: 12 })).toBe('release')
	})

	it('releases an unregistered team once registration closes', () => {
		expect(decideDisposition({ ...base, registrationClosed: true })).toBe(
			'release'
		)
	})

	it('holds while an unregistered team is still in the running', () => {
		expect(decideDisposition({ ...base, spotsClaimed: 11 })).toBe('hold')
	})
})

describe('keep', () => {
	it('captures a single hold for the full amount', () => {
		const only = contribution(TOTAL)
		expect(plan([only], 'keep')).toEqual({
			actions: [
				{
					type: 'capture',
					paymentIntentId: only.paymentIntentId,
					amountCents: TOTAL,
				},
			],
			shortfallCents: 0,
		})
	})

	it('captures every hold of an exact split', () => {
		const holds = [
			contribution(50_000),
			contribution(30_000),
			contribution(20_000),
		]
		expect(plan(holds, 'keep').actions).toEqual(
			holds.map((h) => ({
				type: 'capture',
				paymentIntentId: h.paymentIntentId,
				amountCents: h.amountCents,
			}))
		)
	})

	it('captures part of the hold that crosses the total and cancels the rest', () => {
		// The overpayment race: two teammates both paid the last $500.
		const first = contribution(60_000)
		const second = contribution(50_000)
		const third = contribution(20_000)

		expect(plan([first, second, third], 'keep').actions).toEqual([
			{
				type: 'capture',
				paymentIntentId: first.paymentIntentId,
				amountCents: 60_000,
			},
			{
				type: 'capture',
				paymentIntentId: second.paymentIntentId,
				amountCents: 40_000,
			},
			{ type: 'cancel', paymentIntentId: third.paymentIntentId },
		])
	})

	it('never captures more than the total', () => {
		const holds = [
			contribution(70_000),
			contribution(70_000),
			contribution(70_000),
		]
		const captured = plan(holds, 'keep')
			.actions.filter((a) => a.type === 'capture')
			.reduce((sum, a) => sum + (a.type === 'capture' ? a.amountCents : 0), 0)
		expect(captured).toBe(TOTAL)
	})

	it('charges the earliest contributors, whatever order they are listed in', () => {
		const late = contribution(100_000, 'authorized', {
			createdAtMillis: NOW - HOUR,
		})
		const early = contribution(100_000, 'authorized', {
			createdAtMillis: NOW - 2 * HOUR,
		})
		expect(plan([late, early], 'keep').actions).toEqual([
			{
				type: 'capture',
				paymentIntentId: early.paymentIntentId,
				amountCents: TOTAL,
			},
			{ type: 'cancel', paymentIntentId: late.paymentIntentId },
		])
	})

	it('breaks a tie in time by PaymentIntent id, so every run agrees', () => {
		// Two concurrent settlements of the same team must plan the same
		// captures, or one of them captures a hold the other cancelled.
		const b = contribution(TOTAL, 'authorized', {
			paymentIntentId: 'pi_b',
			createdAtMillis: NOW,
		})
		const a = contribution(TOTAL, 'authorized', {
			paymentIntentId: 'pi_a',
			createdAtMillis: NOW,
		})
		expect(plan([b, a], 'keep').actions[0]).toMatchObject({
			type: 'capture',
			paymentIntentId: 'pi_a',
		})
		expect(plan([a, b], 'keep').actions[0]).toMatchObject({
			paymentIntentId: 'pi_a',
		})
	})

	it('counts money already captured before capturing more', () => {
		// A settlement that was interrupted part-way, or a hold the expiry net
		// captured before the team registered.
		const captured = contribution(60_000, 'captured')
		const hold = contribution(60_000)
		expect(plan([captured, hold], 'keep').actions).toEqual([
			{
				type: 'capture',
				paymentIntentId: hold.paymentIntentId,
				amountCents: 40_000,
			},
		])
	})

	it('does nothing to a team already settled', () => {
		const done = [
			contribution(60_000, 'captured'),
			contribution(40_000, 'captured'),
		]
		expect(plan(done, 'keep')).toEqual({ actions: [], shortfallCents: 0 })
	})

	it('cancels a hold that arrives after the team was covered', () => {
		// A teammate who paid while the capture was already under way.
		const late = contribution(20_000)
		expect(
			plan([contribution(TOTAL, 'captured'), late], 'keep').actions
		).toEqual([{ type: 'cancel', paymentIntentId: late.paymentIntentId }])
	})

	it('refunds the excess if more than the total was captured', () => {
		// Should not happen — every capture is bounded — but if it does, the
		// newest capture gives back the difference.
		const first = contribution(80_000, 'captured')
		const second = contribution(50_000, 'captured')
		expect(plan([first, second], 'keep').actions).toEqual([
			{
				type: 'refund',
				paymentIntentId: second.paymentIntentId,
				amountCents: 30_000,
			},
		])
	})

	it('ignores contributions that are already cancelled or refunded', () => {
		const hold = contribution(TOTAL)
		expect(
			plan(
				[
					contribution(TOTAL, 'canceled'),
					contribution(TOTAL, 'refunded'),
					hold,
				],
				'keep'
			).actions
		).toEqual([
			{
				type: 'capture',
				paymentIntentId: hold.paymentIntentId,
				amountCents: TOTAL,
			},
		])
	})

	it('reports a shortfall when a registered team no longer has the money', () => {
		// A bank released a hold after the team registered. Registration
		// stands; somebody has to chase the difference.
		const hold = contribution(70_000)
		expect(plan([hold, contribution(30_000, 'canceled')], 'keep')).toEqual({
			actions: [
				{
					type: 'capture',
					paymentIntentId: hold.paymentIntentId,
					amountCents: 70_000,
				},
			],
			shortfallCents: 30_000,
		})
	})

	it('writes off a remainder Stripe will not charge rather than overcharging', () => {
		// Only possible with a total that is not whole dollars.
		const first = contribution(99_980)
		const second = contribution(1_000)
		expect(plan([first, second], 'keep', 100_000)).toEqual({
			actions: [
				{
					type: 'capture',
					paymentIntentId: first.paymentIntentId,
					amountCents: 99_980,
				},
				{ type: 'cancel', paymentIntentId: second.paymentIntentId },
			],
			shortfallCents: 0,
		})
	})

	it('captures exactly the Stripe minimum when that is what is owed', () => {
		const first = contribution(99_950)
		const second = contribution(1_000)
		expect(plan([first, second], 'keep', 100_000).actions[1]).toEqual({
			type: 'capture',
			paymentIntentId: second.paymentIntentId,
			amountCents: 50,
		})
	})
})

describe('release', () => {
	it('cancels every hold, which costs nothing', () => {
		const holds = [contribution(60_000), contribution(40_000)]
		expect(plan(holds, 'release')).toEqual({
			actions: holds.map((h) => ({
				type: 'cancel',
				paymentIntentId: h.paymentIntentId,
			})),
			shortfallCents: 0,
		})
	})

	it('refunds money the expiry net had already captured', () => {
		const captured = contribution(60_000, 'captured')
		const hold = contribution(40_000)
		expect(plan([captured, hold], 'release').actions).toEqual([
			{
				type: 'refund',
				paymentIntentId: captured.paymentIntentId,
				amountCents: 60_000,
			},
			{ type: 'cancel', paymentIntentId: hold.paymentIntentId },
		])
	})

	it('never captures', () => {
		// Capturing for a team that is not playing would be charging someone
		// for nothing and then paying a fee to undo it.
		const actions = plan(
			[contribution(TOTAL), contribution(TOTAL), contribution(5_000)],
			'release'
		).actions
		expect(actions.some((a) => a.type === 'capture')).toBe(false)
	})

	it('does nothing once everything is settled', () => {
		expect(
			plan(
				[contribution(TOTAL, 'canceled'), contribution(TOTAL, 'refunded')],
				'release'
			)
		).toEqual({ actions: [], shortfallCents: 0 })
	})
})

describe('hold', () => {
	const expiringIn = (ms: number) => ({ captureBeforeMillis: NOW + ms })

	it('leaves fresh holds alone', () => {
		expect(plan([contribution(60_000), contribution(40_000)], 'hold')).toEqual({
			actions: [],
			shortfallCents: 0,
		})
	})

	it('captures a hold inside the expiry margin rather than let it lapse', () => {
		const expiring = contribution(60_000, 'authorized', expiringIn(6 * HOUR))
		const fresh = contribution(40_000)
		expect(plan([expiring, fresh], 'hold').actions).toEqual([
			{
				type: 'capture',
				paymentIntentId: expiring.paymentIntentId,
				amountCents: 60_000,
			},
		])
	})

	it('captures right at the edge of the margin', () => {
		const edge = contribution(
			60_000,
			'authorized',
			expiringIn(EXPIRY_CAPTURE_MARGIN_MS)
		)
		expect(plan([edge], 'hold').actions).toHaveLength(1)
	})

	it('waits one millisecond before the margin', () => {
		const early = contribution(
			60_000,
			'authorized',
			expiringIn(EXPIRY_CAPTURE_MARGIN_MS + 1)
		)
		expect(plan([early], 'hold').actions).toEqual([])
	})

	it('captures a hold that has already passed its expiry', () => {
		// A sweep that was down for a day. Stripe decides whether it still
		// succeeds; the planner still has to try.
		const lapsed = contribution(60_000, 'authorized', expiringIn(-HOUR))
		expect(plan([lapsed], 'hold').actions).toHaveLength(1)
	})

	it('assumes a seven-day window when the charge gave no expiry', () => {
		const unknown = contribution(60_000, 'authorized', {
			captureBeforeMillis: null,
			createdAtMillis: NOW - DEFAULT_AUTHORIZATION_WINDOW_MS + 12 * HOUR,
		})
		expect(plan([unknown], 'hold').actions).toHaveLength(1)
	})

	it('captures only what the team would owe, releasing an expiring excess', () => {
		// An overpaid team whose holds are all expiring: take the total, give
		// the rest back, exactly as registering would.
		const first = contribution(70_000, 'authorized', expiringIn(HOUR))
		const second = contribution(70_000, 'authorized', expiringIn(HOUR))
		expect(plan([first, second], 'hold').actions).toEqual([
			{
				type: 'capture',
				paymentIntentId: first.paymentIntentId,
				amountCents: 70_000,
			},
			{
				type: 'capture',
				paymentIntentId: second.paymentIntentId,
				amountCents: 30_000,
			},
		])
	})

	it('never refunds', () => {
		// A team still in the running keeps what it has.
		const actions = plan(
			[
				contribution(80_000, 'captured'),
				contribution(50_000, 'captured'),
				contribution(10_000, 'authorized', expiringIn(HOUR)),
			],
			'hold'
		).actions
		expect(actions.some((a) => a.type === 'refund')).toBe(false)
	})
})

describe('contributionStateFromPaymentIntent', () => {
	it('reads a live hold', () => {
		expect(
			contributionStateFromPaymentIntent({
				status: 'requires_capture',
				amount_capturable: 25_000,
				amount_received: 0,
			})
		).toEqual({ status: 'authorized', amountCents: 25_000 })
	})

	it('reads a capture, including a partial one', () => {
		expect(
			contributionStateFromPaymentIntent({
				status: 'succeeded',
				amount_capturable: 0,
				amount_received: 40_000,
				latest_charge: { amount_refunded: 0 },
			})
		).toEqual({ status: 'captured', amountCents: 40_000 })
	})

	it('nets out a partial refund', () => {
		expect(
			contributionStateFromPaymentIntent({
				status: 'succeeded',
				amount_capturable: 0,
				amount_received: 40_000,
				latest_charge: { amount_refunded: 15_000 },
			})
		).toEqual({ status: 'captured', amountCents: 25_000 })
	})

	it('reads a full refund', () => {
		expect(
			contributionStateFromPaymentIntent({
				status: 'succeeded',
				amount_capturable: 0,
				amount_received: 40_000,
				latest_charge: { amount_refunded: 40_000 },
			})
		).toEqual({ status: 'refunded', amountCents: 40_000 })
	})

	it('treats an unexpanded charge as nothing refunded', () => {
		expect(
			contributionStateFromPaymentIntent({
				status: 'succeeded',
				amount_capturable: 0,
				amount_received: 40_000,
				latest_charge: 'ch_1',
			})
		).toEqual({ status: 'captured', amountCents: 40_000 })
	})

	it('reads a cancellation', () => {
		expect(
			contributionStateFromPaymentIntent({
				status: 'canceled',
				amount_capturable: 0,
				amount_received: 0,
			})
		).toEqual({ status: 'canceled' })
	})

	it.each(['processing', 'requires_action', 'requires_payment_method'])(
		'leaves the ledger alone while the PaymentIntent is %s',
		(status) => {
			expect(
				contributionStateFromPaymentIntent({
					status,
					amount_capturable: 0,
					amount_received: 0,
				})
			).toBeNull()
		}
	)
})
