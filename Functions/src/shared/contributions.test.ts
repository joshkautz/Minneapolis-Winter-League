import { describe, expect, it } from 'vitest'
import {
	contributionAmountError,
	holdsMoney,
	paidByRosterCents,
	paidCents,
} from './contributions.js'
import type { TeamContributionDocument } from '../types.js'

/**
 * The arithmetic a team's registration depends on, tested without a database
 * or a payment processor.
 *
 * Deciding what a team has paid, and whether it still holds money, is a pure
 * function over its contributions. Keeping it that way is what makes the
 * overpayment race and the refund rules testable at all — the alternative is
 * asserting money against a mocked Stripe.
 */

const contribution = (
	amountCents: number,
	status: TeamContributionDocument['status'],
	playerId = 'payer'
): TeamContributionDocument =>
	({
		amountCents,
		status,
		player: { id: playerId },
	}) as TeamContributionDocument

describe('paidCents', () => {
	it('is zero for a team with no contributions', () => {
		expect(paidCents([])).toBe(0)
	})

	it('reaches the total however the team splits it', () => {
		const oneBigPayment = [contribution(100_000, 'paid')]
		const twentySmallOnes = Array.from({ length: 20 }, () =>
			contribution(5_000, 'paid')
		)
		const tenMediumOnes = Array.from({ length: 10 }, () =>
			contribution(10_000, 'paid')
		)

		for (const split of [oneBigPayment, twentySmallOnes, tenMediumOnes]) {
			expect(paidCents(split)).toBe(100_000)
		}
	})

	it('does not count money that has been refunded', () => {
		expect(
			paidCents([
				contribution(100_000, 'refunded'),
				contribution(10_000, 'paid'),
			])
		).toBe(10_000)
	})

	it('counts an overpayment at its full value', () => {
		// Two players both paying the last $200 leaves the team over. The
		// excess is refunded by settlement, not hidden here.
		expect(
			paidCents([
				contribution(80_000, 'paid'),
				contribution(20_000, 'paid'),
				contribution(20_000, 'paid'),
			])
		).toBe(120_000)
	})
})

describe('paidByRosterCents', () => {
	it('counts only the people still on the team', () => {
		expect(
			paidByRosterCents(
				[
					contribution(60_000, 'paid', 'left'),
					contribution(30_000, 'paid', 'stayed'),
					contribution(10_000, 'refunded', 'stayed'),
				],
				new Set(['stayed'])
			)
		).toBe(30_000)
	})
})

describe('holdsMoney', () => {
	it('is false for a team that never paid', () => {
		expect(holdsMoney([])).toBe(false)
	})

	it('is false once everything is refunded', () => {
		expect(
			holdsMoney([
				contribution(50_000, 'refunded'),
				contribution(50_000, 'refunded'),
			])
		).toBe(false)
	})

	it('is true when one contribution of many is still paid', () => {
		// The check that stops a team being deleted. One payment still held is
		// enough to block it, because deleting the team loses the record of
		// who is owed.
		expect(
			holdsMoney([
				contribution(50_000, 'refunded'),
				contribution(1_000, 'paid'),
			])
		).toBe(true)
	})
})

describe('contributionAmountError', () => {
	// The amount is the one number a payer gets to choose. The server is the
	// only check on it: the App's form is a convenience, and a callable can
	// be invoked with anything.
	const REMAINING = 60_000

	it('accepts an amount between the floor and the balance', () => {
		expect(contributionAmountError(25_000, REMAINING)).toBeNull()
	})

	it('accepts exactly the floor', () => {
		expect(contributionAmountError(1_000, REMAINING)).toBeNull()
	})

	it('accepts exactly the remaining balance', () => {
		expect(contributionAmountError(REMAINING, REMAINING)).toBeNull()
	})

	it('rejects one dollar below the floor', () => {
		expect(contributionAmountError(900, REMAINING)).toMatch(/at least \$10\.00/)
	})

	it('rejects one dollar over the balance', () => {
		// Stops a single payer committing more than the team can use, which
		// would be a hold settlement has to release.
		expect(contributionAmountError(REMAINING + 100, REMAINING)).toMatch(
			/only needs \$600\.00/
		)
	})

	it.each([
		['a cent over a dollar amount', 25_001],
		['fifty cents over', 25_050],
		['under a dollar', 50],
	])('rejects %s, because contributions are whole dollars', (_l, amount) => {
		// A remainder under a dollar could fall below Stripe's 50-cent
		// minimum, and settlement would then have to overcharge or write it
		// off.
		expect(contributionAmountError(amount, REMAINING)).toMatch(
			/whole number of dollars/
		)
	})

	it('lowers the floor to the balance when less than the floor is owed', () => {
		// A team $5 short has to be able to pay $5; otherwise it could never
		// finish.
		expect(contributionAmountError(500, 500)).toBeNull()
		expect(contributionAmountError(400, 500)).toMatch(/at least \$5\.00/)
	})

	it.each([
		['zero', 0],
		['a negative amount', -1_000],
		['fractional cents', 1_000.5],
		['NaN', Number.NaN],
		['Infinity', Number.POSITIVE_INFINITY],
		['an unsafe integer', 2 ** 53],
		['a numeric string', '5000'],
		['null', null],
		['undefined', undefined],
	])('rejects %s', (_label, amount) => {
		expect(contributionAmountError(amount, REMAINING)).toMatch(/whole number/)
	})
})
