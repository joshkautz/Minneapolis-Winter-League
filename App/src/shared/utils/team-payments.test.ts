import { describe, expect, it } from 'vitest'
import {
	committedByRosterCents,
	committedCents,
	contributionAmountError,
	formatDollars,
	isPlayerRegisteredForSeason,
	suggestedContributionsCents,
	totalsFrom,
	usesTeamPayments,
} from './team-payments'

/**
 * The team payment page's rules, mirrored from the Functions. The server is
 * the check that counts; these decide what the page says and whether the
 * form lets a payer submit at all, so they must agree with it.
 */

const TEAM_SEASON = { teamRegistrationTotalCents: 100_000 }
const PER_PLAYER_SEASON = {}

describe('usesTeamPayments', () => {
	it('is true when the season sets a total', () => {
		expect(usesTeamPayments(TEAM_SEASON)).toBe(true)
	})

	it.each([
		['absent', PER_PLAYER_SEASON],
		['null', { teamRegistrationTotalCents: null as unknown as number }],
		['no season', undefined],
	])('is false when the total is %s', (_label, season) => {
		expect(usesTeamPayments(season)).toBe(false)
	})
})

describe('isPlayerRegisteredForSeason', () => {
	it('counts a signed player under team payments, paid or not', () => {
		// The money is the team's; one captain can cover everyone.
		expect(
			isPlayerRegisteredForSeason({ signed: true, paid: false }, TEAM_SEASON)
		).toBe(true)
	})

	it('needs paid and signed under per-player pricing', () => {
		expect(
			isPlayerRegisteredForSeason(
				{ signed: true, paid: false },
				PER_PLAYER_SEASON
			)
		).toBe(false)
		expect(
			isPlayerRegisteredForSeason(
				{ signed: true, paid: true },
				PER_PLAYER_SEASON
			)
		).toBe(true)
	})

	it.each([
		['team payments', TEAM_SEASON],
		['per-player pricing', PER_PLAYER_SEASON],
	])('never counts an unsigned player under %s', (_label, season) => {
		expect(
			isPlayerRegisteredForSeason({ signed: false, paid: true }, season)
		).toBe(false)
	})

	it('is false with no player season record', () => {
		expect(isPlayerRegisteredForSeason(undefined, TEAM_SEASON)).toBe(false)
	})
})

describe('totals', () => {
	const ledger = [
		{ status: 'authorized' as const, amountCents: 40_000 },
		{ status: 'captured' as const, amountCents: 30_000 },
		{ status: 'canceled' as const, amountCents: 20_000 },
		{ status: 'refunded' as const, amountCents: 10_000 },
	]

	it('separates what is held from what is taken', () => {
		expect(totalsFrom(ledger)).toEqual({
			authorizedCents: 40_000,
			capturedCents: 30_000,
		})
	})

	it('counts held and taken money as committed, and nothing released', () => {
		expect(committedCents(ledger)).toBe(70_000)
	})

	it('counts only the current roster’s money toward the total', () => {
		const byPayer = [
			{
				status: 'authorized' as const,
				amountCents: 40_000,
				player: { id: 'on' },
			},
			{
				status: 'captured' as const,
				amountCents: 30_000,
				player: { id: 'left' },
			},
			{
				status: 'canceled' as const,
				amountCents: 20_000,
				player: { id: 'on' },
			},
		]
		expect(committedByRosterCents(byPayer as never, new Set(['on']))).toBe(
			40_000
		)
	})
})

describe('contributionAmountError', () => {
	const REMAINING = 60_000

	it.each([
		['the floor', 1_000],
		['a middling amount', 25_000],
		['the whole remainder', REMAINING],
	])('accepts %s', (_label, amount) => {
		expect(contributionAmountError(amount, REMAINING)).toBeNull()
	})

	it('rejects less than $10', () => {
		expect(contributionAmountError(900, REMAINING)).toMatch(/minimum.*\$10/)
	})

	it('rejects more than the team needs', () => {
		expect(contributionAmountError(REMAINING + 100, REMAINING)).toMatch(
			/only needs \$600/
		)
	})

	it('rejects cents', () => {
		expect(contributionAmountError(25_050, REMAINING)).toMatch(/whole dollars/)
	})

	it.each([0, -100, Number.NaN, 12.5])('rejects %s', (amount) => {
		expect(contributionAmountError(amount, REMAINING)).toMatch(
			/Enter an amount/
		)
	})

	it('lets a team pay off less than $10', () => {
		expect(contributionAmountError(500, 500)).toBeNull()
	})
})

describe('suggestedContributionsCents', () => {
	it('offers the remainder first, then round amounts below it', () => {
		expect(suggestedContributionsCents(100_000)).toEqual([
			100_000, 50_000, 25_000, 10_000, 5_000,
		])
	})

	it('drops amounts that are not below the remainder', () => {
		expect(suggestedContributionsCents(30_000)).toEqual([
			30_000, 25_000, 10_000, 5_000,
		])
	})

	it('offers only the remainder when little is left', () => {
		expect(suggestedContributionsCents(4_000)).toEqual([4_000])
	})

	it('offers nothing when nothing is owed', () => {
		expect(suggestedContributionsCents(0)).toEqual([])
	})

	it('only suggests amounts the server would accept', () => {
		for (const remaining of [500, 1_000, 7_300, 45_000, 100_000]) {
			for (const amount of suggestedContributionsCents(remaining)) {
				expect(contributionAmountError(amount, remaining)).toBeNull()
			}
		}
	})
})

describe('formatDollars', () => {
	it('drops cents for whole dollars', () => {
		expect(formatDollars(100_000)).toBe('$1,000')
	})

	it('shows cents otherwise', () => {
		expect(formatDollars(1_250)).toBe('$12.50')
	})
})
