import { describe, expect, it } from 'vitest'
import {
	committedCents,
	contributionAmountError,
	hasUnsettledMoney,
	totalsFrom,
} from './contributions.js'
import type { TeamContributionDocument } from '../types.js'

/**
 * The arithmetic a team's registration depends on, tested without a database
 * or a payment processor.
 *
 * Deciding what a team has committed, what is still live, and what is settled
 * is a pure function over its contributions. Keeping it that way is what
 * makes the overpayment race and the capture lifecycle testable at all — the
 * alternative is asserting money against a mocked Stripe.
 */

const contribution = (
	amountCents: number,
	status: TeamContributionDocument['status']
): TeamContributionDocument =>
	({ amountCents, status }) as TeamContributionDocument

describe('totalsFrom', () => {
	it('is zero for a team with no contributions', () => {
		expect(totalsFrom([])).toEqual({ authorizedCents: 0, capturedCents: 0 })
	})

	it('sums holds and captures separately', () => {
		expect(
			totalsFrom([
				contribution(50_000, 'authorized'),
				contribution(30_000, 'captured'),
				contribution(20_000, 'authorized'),
			])
		).toEqual({ authorizedCents: 70_000, capturedCents: 30_000 })
	})

	it.each(['canceled', 'refunded'] as const)(
		'counts a %s contribution toward neither total',
		(status) => {
			expect(
				totalsFrom([
					contribution(100_000, status),
					contribution(10_000, 'authorized'),
				])
			).toEqual({ authorizedCents: 10_000, capturedCents: 0 })
		}
	)
})

describe('committedCents', () => {
	it('counts both holds and captures', () => {
		// Registration tests committed money, so capturing a hold must not
		// make a registered team suddenly look unfunded.
		expect(
			committedCents([
				contribution(60_000, 'authorized'),
				contribution(40_000, 'captured'),
			])
		).toBe(100_000)
	})

	it('reaches the threshold however the team splits it', () => {
		const oneBigPayment = [contribution(100_000, 'authorized')]
		const twentySmallOnes = Array.from({ length: 20 }, () =>
			contribution(5_000, 'authorized')
		)
		const tenMediumOnes = Array.from({ length: 10 }, () =>
			contribution(10_000, 'authorized')
		)

		for (const split of [oneBigPayment, twentySmallOnes, tenMediumOnes]) {
			expect(committedCents(split)).toBe(100_000)
		}
	})

	it('does not count money that has been given back', () => {
		expect(
			committedCents([
				contribution(100_000, 'refunded'),
				contribution(100_000, 'canceled'),
			])
		).toBe(0)
	})

	it('counts an overpayment at its full value', () => {
		// Two players both paying the last $200 leaves the team over. The
		// excess is resolved at capture, not by pretending it is not there.
		expect(
			committedCents([
				contribution(80_000, 'authorized'),
				contribution(20_000, 'authorized'),
				contribution(20_000, 'authorized'),
			])
		).toBe(120_000)
	})
})

describe('hasUnsettledMoney', () => {
	it('is false for a team that never paid', () => {
		expect(hasUnsettledMoney([])).toBe(false)
	})

	it.each(['authorized', 'captured'] as const)(
		'is true while money is %s',
		(status) => {
			expect(hasUnsettledMoney([contribution(10_000, status)])).toBe(true)
		}
	)

	it('is false once everything is cancelled or refunded', () => {
		expect(
			hasUnsettledMoney([
				contribution(50_000, 'canceled'),
				contribution(50_000, 'refunded'),
			])
		).toBe(false)
	})

	it('is true when one contribution of many is still live', () => {
		// The check that stops a team being deleted. One unsettled payment is
		// enough to block it, because deleting the team loses the record of
		// who is owed.
		expect(
			hasUnsettledMoney([
				contribution(50_000, 'refunded'),
				contribution(50_000, 'canceled'),
				contribution(1_000, 'authorized'),
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

	it('rejects one cent below the floor', () => {
		expect(contributionAmountError(999, REMAINING)).toMatch(/at least \$10\.00/)
	})

	it('rejects one cent over the balance', () => {
		// Stops a single payer committing more than the team can use, which
		// would be a hold settlement has to release.
		expect(contributionAmountError(REMAINING + 1, REMAINING)).toMatch(
			/only needs \$600\.00/
		)
	})

	it('lowers the floor to the balance when less than the floor is owed', () => {
		// A team $5 short has to be able to pay $5; otherwise it could never
		// finish.
		expect(contributionAmountError(500, 500)).toBeNull()
		expect(contributionAmountError(499, 500)).toMatch(/at least \$5\.00/)
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
