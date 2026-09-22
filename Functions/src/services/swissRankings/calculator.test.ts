import { describe, expect, it } from 'vitest'
import { GameDocument } from '../../types.js'
import { calculateSwissRankings, getInitialSeedingRank } from './calculator.js'

/**
 * Swiss standings are what the public standings page shows and what seeds the
 * next round's matchups, so an error here is visible to every player and
 * changes who plays whom.
 *
 * Swiss Score = wins * 2 + Buchholz, where Buchholz is the sum of every
 * opponent's win count (strength of schedule). Ties break on point
 * differential.
 */

/** Minimal GameDocument: only the fields the calculator reads. */
const game = (
	home: string | null,
	away: string | null,
	homeScore: number | null,
	awayScore: number | null
): GameDocument =>
	({
		home: home === null ? null : { id: home },
		away: away === null ? null : { id: away },
		homeScore,
		awayScore,
	}) as unknown as GameDocument

const byId = (
	result: ReturnType<typeof calculateSwissRankings>,
	id: string
) => {
	const ranking = result.rankings.find((r) => r.teamId === id)
	if (!ranking) {
		throw new Error(`no ranking for team "${id}"`)
	}
	return ranking
}

describe('calculateSwissRankings', () => {
	it('includes teams that have not played, at zero', () => {
		// Teams with no games must still appear, or they vanish from standings.
		const result = calculateSwissRankings([], ['a', 'b'])
		expect(result.rankings).toHaveLength(2)
		expect(byId(result, 'a')).toMatchObject({
			wins: 0,
			losses: 0,
			swissScore: 0,
			buchholzScore: 0,
			pointDifferential: 0,
		})
	})

	it('records a win, a loss and both point differentials from one game', () => {
		const result = calculateSwissRankings([game('a', 'b', 15, 10)], ['a', 'b'])
		expect(byId(result, 'a')).toMatchObject({
			wins: 1,
			losses: 0,
			pointsFor: 15,
			pointsAgainst: 10,
			pointDifferential: 5,
		})
		expect(byId(result, 'b')).toMatchObject({
			wins: 0,
			losses: 1,
			pointsFor: 10,
			pointsAgainst: 15,
			pointDifferential: -5,
		})
	})

	it('counts a draw as neither a win nor a loss', () => {
		const result = calculateSwissRankings([game('a', 'b', 12, 12)], ['a', 'b'])
		expect(byId(result, 'a')).toMatchObject({ wins: 0, losses: 0 })
		expect(byId(result, 'b')).toMatchObject({ wins: 0, losses: 0 })
	})

	it('computes Buchholz as the sum of opponents’ wins', () => {
		// a beats b; b beats c. a's only opponent is b, who has 1 win,
		// so a's Buchholz is 1 and its Swiss score is 1*2 + 1 = 3.
		const result = calculateSwissRankings(
			[game('a', 'b', 15, 10), game('b', 'c', 15, 10)],
			['a', 'b', 'c']
		)
		expect(byId(result, 'a')).toMatchObject({
			wins: 1,
			buchholzScore: 1,
			swissScore: 3,
		})
		// b beat c (0 wins) and lost to a (1 win) => Buchholz 1, score 1*2+1 = 3.
		expect(byId(result, 'b')).toMatchObject({
			wins: 1,
			buchholzScore: 1,
			swissScore: 3,
		})
		// c lost to b (1 win) => Buchholz 1, score 0*2+1 = 1.
		expect(byId(result, 'c')).toMatchObject({
			wins: 0,
			buchholzScore: 1,
			swissScore: 1,
		})
	})

	it('rewards the harder schedule when win counts are equal', () => {
		// a and d each win once. a beat b (who also won a game); d beat e
		// (who won nothing). a should outrank d on Buchholz alone.
		const result = calculateSwissRankings(
			[game('a', 'b', 15, 10), game('b', 'c', 15, 10), game('d', 'e', 15, 10)],
			['a', 'b', 'c', 'd', 'e']
		)
		expect(byId(result, 'a').buchholzScore).toBe(1)
		expect(byId(result, 'd').buchholzScore).toBe(0)
		expect(byId(result, 'a').rank).toBeLessThan(byId(result, 'd').rank)
	})

	it('breaks a Swiss-score tie on point differential', () => {
		const result = calculateSwissRankings(
			[game('a', 'b', 20, 0), game('c', 'd', 11, 10)],
			['a', 'b', 'c', 'd']
		)
		// Both a and c have 1 win and Buchholz 0, so only differential separates them.
		expect(byId(result, 'a').swissScore).toBe(byId(result, 'c').swissScore)
		expect(byId(result, 'a').rank).toBeLessThan(byId(result, 'c').rank)
	})

	it('gives teams tied on both score and differential the same rank', () => {
		const result = calculateSwissRankings(
			[game('a', 'b', 15, 10), game('c', 'd', 15, 10)],
			['a', 'b', 'c', 'd']
		)
		expect(byId(result, 'a').rank).toBe(byId(result, 'c').rank)
	})

	it('skips games that are not yet played', () => {
		// A scheduled-but-unplayed game has null scores and must not count.
		const result = calculateSwissRankings(
			[game('a', 'b', null, null), game('a', 'b', 15, 10)],
			['a', 'b']
		)
		expect(byId(result, 'a')).toMatchObject({ wins: 1, losses: 0 })
		expect(byId(result, 'a').opponentIds).toEqual(['b'])
	})

	it('skips placeholder games with no teams assigned', () => {
		// Playoff placeholders exist before the bracket is known.
		const result = calculateSwissRankings(
			[game(null, null, 15, 10), game('a', 'b', 15, 10)],
			['a', 'b']
		)
		expect(result.rankings).toHaveLength(2)
		expect(byId(result, 'a').wins).toBe(1)
	})

	it('accumulates repeat meetings between the same teams', () => {
		const result = calculateSwissRankings(
			[game('a', 'b', 15, 10), game('b', 'a', 15, 10)],
			['a', 'b']
		)
		expect(byId(result, 'a')).toMatchObject({ wins: 1, losses: 1 })
		expect(byId(result, 'a').opponentIds).toEqual(['b', 'b'])
	})

	it('returns a win count for every team', () => {
		const result = calculateSwissRankings([game('a', 'b', 15, 10)], ['a', 'b'])
		expect(result.teamWins.get('a')).toBe(1)
		expect(result.teamWins.get('b')).toBe(0)
	})

	it('ranks a full round-robin deterministically', () => {
		const result = calculateSwissRankings(
			[game('a', 'b', 15, 5), game('a', 'c', 15, 8), game('b', 'c', 15, 12)],
			['a', 'b', 'c']
		)
		expect(result.rankings.map((r) => r.teamId)).toEqual(['a', 'b', 'c'])
		expect(result.rankings.map((r) => r.rank)).toEqual([1, 2, 3])
	})
})

describe('getInitialSeedingRank', () => {
	it('returns a 1-based seed position', () => {
		expect(getInitialSeedingRank('b', ['a', 'b', 'c'])).toBe(2)
	})

	it('returns null for a team that is not seeded', () => {
		expect(getInitialSeedingRank('z', ['a', 'b'])).toBeNull()
	})

	it('returns null when no seeding exists', () => {
		expect(getInitialSeedingRank('a', undefined)).toBeNull()
		expect(getInitialSeedingRank('a', [])).toBeNull()
	})
})
