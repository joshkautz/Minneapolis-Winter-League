import { describe, expect, it } from 'vitest'
import {
	CHAMPIONSHIP_POOL_GAMES,
	POOL_NIGHT,
	POOLS,
	REGULAR_SEASON_TABLES,
	ROUNDS_PER_NIGHT,
	SCHEDULE_TEAMS,
	type NumberedNight,
} from './templates.js'

/**
 * The schedule tables, held to what they promise. A mistyped number in a
 * table breaks at least one of these.
 */

const TEAMS = Array.from({ length: SCHEDULE_TEAMS }, (_, i) => i + 1)
const FIELDS = 3
const pairKey = (a: number, b: number): string =>
	a < b ? `${a}-${b}` : `${b}-${a}`

/** The rounds each team plays in on a night, from 1. */
const roundsPlayed = (night: NumberedNight): Map<number, number[]> => {
	const rounds = new Map<number, number[]>()
	night.forEach((round, roundIndex) =>
		round.forEach(([home, away]) => {
			for (const team of [home, away]) {
				rounds.set(team, [...(rounds.get(team) ?? []), roundIndex + 1])
			}
		})
	)
	return rounds
}

describe.each(Object.entries(REGULAR_SEASON_TABLES))(
	'the %s-night regular season',
	(nights, table) => {
		const weeks = Number(nights)
		const games = weeks * 2

		it('has a night for each week, each four rounds of three games', () => {
			expect(table).toHaveLength(weeks)
			for (const night of table) {
				expect(night).toHaveLength(ROUNDS_PER_NIGHT)
				for (const round of night) expect(round).toHaveLength(FIELDS)
			}
		})

		it('has every team play twice a night, back to back', () => {
			for (const night of table) {
				const rounds = roundsPlayed(night)
				expect([...rounds.keys()].sort((a, b) => a - b)).toEqual(TEAMS)
				for (const played of rounds.values()) {
					expect([
						[1, 2],
						[3, 4],
					]).toContainEqual(played)
				}
			}
		})

		it('never has two teams meet twice', () => {
			const pairs = table.flat(2).map(([a, b]) => pairKey(a, b))
			expect(new Set(pairs).size).toBe(pairs.length)
			expect(pairs).toHaveLength(weeks * ROUNDS_PER_NIGHT * FIELDS)
		})

		it('gives every team its share of early nights', () => {
			for (const team of TEAMS) {
				const early = table.filter((night) =>
					night[0].some((game) => game.includes(team))
				).length
				expect(early).toBeGreaterThanOrEqual(Math.floor(weeks / 2))
				expect(early).toBeLessThanOrEqual(Math.ceil(weeks / 2))
			}
		})

		it('has every team at home for half its games', () => {
			for (const team of TEAMS) {
				const home = table.flat(2).filter(([h]) => h === team).length
				expect(home).toBe(games / 2)
			}
		})

		it('spreads every team across the three fields', () => {
			for (const team of TEAMS) {
				const perField = [0, 1, 2].map(
					(field) =>
						table.flat().filter((round) => round[field].includes(team)).length
				)
				for (const count of perField) {
					expect(count).toBeGreaterThanOrEqual(Math.floor(games / FIELDS))
					expect(count).toBeLessThanOrEqual(Math.ceil(games / FIELDS))
				}
			}
		})
	}
)

describe('pool night', () => {
	it('splits the twelve seeds into four pools of three', () => {
		expect(POOLS.flat().sort((a, b) => a - b)).toEqual(TEAMS)
	})

	it('plays each pool’s round robin and nothing else', () => {
		const pairs = POOL_NIGHT.flat().map(([a, b]) => pairKey(a, b))
		const expected = POOLS.flatMap(([a, b, c]) => [
			pairKey(a, b),
			pairKey(a, c),
			pairKey(b, c),
		])
		expect(pairs.sort()).toEqual(expected.sort())
	})

	it('has every team play twice', () => {
		const rounds = roundsPlayed(POOL_NIGHT)
		expect([...rounds.keys()].sort((a, b) => a - b)).toEqual(TEAMS)
		for (const played of rounds.values()) expect(played).toHaveLength(2)
	})

	it('has seeds 2 and 3 play first and last, as the spreadsheet does', () => {
		// Every other team plays two of the four rounds with at most one
		// round between. Seeds 2 and 3 wait through rounds 2 and 3; Season 3
		// played it this way.
		const rounds = roundsPlayed(POOL_NIGHT)
		const waits = [...rounds].filter(
			([, [first, second]]) => second - first > 2
		)
		expect(waits.map(([seed]) => seed).sort()).toEqual([2, 3])
		expect(rounds.get(2)).toEqual([1, 4])
	})
})

describe('championship night', () => {
	it('meets pool 1 against pool 4, then pool 2 against pool 3', () => {
		expect(CHAMPIONSHIP_POOL_GAMES).toEqual([
			[0, 3],
			[1, 2],
		])
	})
})
