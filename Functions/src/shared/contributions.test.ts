import { describe, expect, it } from 'vitest'
import {
	committedCents,
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
