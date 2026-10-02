import { describe, expect, it } from 'vitest'
import {
	decided,
	rankPool,
	recordsOf,
	seedTeams,
	type ScoredGame,
	type SeedableTeam,
} from './standings.js'

const game = (
	homeTeamId: string,
	homeScore: number,
	awayTeamId: string,
	awayScore: number
): ScoredGame => ({ homeTeamId, awayTeamId, homeScore, awayScore })

const team = (
	teamId: string,
	overrides: Partial<SeedableTeam> = {}
): SeedableTeam => ({
	teamId,
	registeredDate: new Date('2026-10-01T05:00:00Z'),
	rating: null,
	...overrides,
})

describe('recordsOf', () => {
	it('counts a level game as a win for neither team', () => {
		const records = recordsOf(['a', 'b'], [game('a', 9, 'b', 9)])
		expect(records.get('a')).toEqual({
			wins: 0,
			losses: 0,
			differential: 0,
			pointsFor: 9,
		})
	})

	it('ignores games against teams outside the group', () => {
		const records = recordsOf(['a', 'b'], [game('a', 13, 'c', 2)])
		expect(records.get('a')?.wins).toBe(0)
	})
})

describe('seedTeams', () => {
	const teams = ['a', 'b', 'c', 'd'].map((id) => team(id))

	it('ranks by wins first', () => {
		const seeds = seedTeams(teams, [
			game('a', 1, 'b', 15),
			game('c', 1, 'd', 15),
			game('b', 12, 'd', 11),
		])
		expect(seeds.slice(0, 2)).toEqual(['b', 'd'])
	})

	it('then by point differential, as the Standings page does', () => {
		const seeds = seedTeams(teams, [
			game('a', 15, 'b', 5),
			game('c', 15, 'd', 14),
		])
		expect(seeds).toEqual(['a', 'c', 'd', 'b'])
	})

	it('then by the result between teams still level', () => {
		// b and c are both 1–1 at +0; b scored more, but c beat b.
		const seeds = seedTeams(teams, [
			game('c', 10, 'b', 8),
			game('b', 12, 'a', 10),
			game('d', 10, 'c', 8),
		])
		expect(seeds).toEqual(['d', 'c', 'b', 'a'])
	})

	it('then by points scored', () => {
		const seeds = seedTeams(teams, [
			game('c', 12, 'd', 10),
			game('a', 4, 'b', 2),
		])
		// a and c are 1–0 at +2, b and d 0–1 at −2; c and d scored more.
		expect(seeds).toEqual(['c', 'a', 'd', 'b'])
	})

	it('then by the roster’s average rating, unrated last', () => {
		const rated = [
			team('a', { rating: 20 }),
			team('b', { rating: 30 }),
			team('c'),
			team('d', { rating: 25 }),
		]
		expect(seedTeams(rated, [])).toEqual(['b', 'd', 'a', 'c'])
	})

	it('and finally by who registered first', () => {
		const registered = [
			team('a', { registeredDate: new Date('2026-10-01T05:00:03Z') }),
			team('b', { registeredDate: new Date('2026-10-01T05:00:01Z') }),
			team('c', { registeredDate: null }),
			team('d', { registeredDate: new Date('2026-10-01T05:00:02Z') }),
		]
		expect(seedTeams(registered, [])).toEqual(['b', 'd', 'a', 'c'])
	})
})

describe('rankPool', () => {
	it('orders a pool by wins in it', () => {
		const order = rankPool(
			['one', 'eight', 'nine'],
			[
				game('one', 5, 'eight', 9),
				game('eight', 9, 'nine', 5),
				game('one', 9, 'nine', 5),
			]
		)
		expect(order).toEqual(['eight', 'one', 'nine'])
	})

	it('breaks a three-way 1–1 tie by point differential in the pool', () => {
		const order = rankPool(
			['one', 'eight', 'nine'],
			[
				game('one', 10, 'eight', 9),
				game('eight', 12, 'nine', 4),
				game('one', 6, 'nine', 9),
			]
		)
		// All 1–1: eight +7, one −2, nine −5.
		expect(order).toEqual(['eight', 'one', 'nine'])
	})

	it('and then by regular-season seed', () => {
		const order = rankPool(
			['one', 'eight', 'nine'],
			[
				game('one', 10, 'eight', 9),
				game('eight', 10, 'nine', 9),
				game('nine', 10, 'one', 9),
			]
		)
		expect(order).toEqual(['one', 'eight', 'nine'])
	})
})

describe('decided', () => {
	it('names the winner and loser', () => {
		expect(decided(game('a', 8, 'b', 11))).toEqual({
			winner: 'b',
			loser: 'a',
		})
	})

	it('decides nothing for a level game', () => {
		expect(decided(game('a', 8, 'b', 8))).toBeNull()
	})
})
