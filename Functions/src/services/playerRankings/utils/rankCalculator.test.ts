import { describe, expect, it } from 'vitest'
import { calculateRanksWithTieHandling } from './rankCalculator.js'
import { PlayerRatingState } from '../types.js'

/**
 * Rank assignment is the last step before rankings are written, and it is the
 * only part of the pipeline a reader sees directly. Ties must share a rank and
 * the next rank must skip by the size of the tied group (1, 1, 3) — an
 * off-by-one here silently renumbers the whole public leaderboard.
 */

const player = (playerId: string, mu: number): PlayerRatingState => ({
	playerId,
	playerName: playerId,
	mu,
	sigma: 8.333,
	totalGames: 1,
	totalSeasons: 1,
	seasonsPlayed: new Set(['season-1']),
	lastSeasonId: 'season-1',
	lastGameDate: null,
	roundsSinceLastGame: 0,
})

/** Builds the ratings map from `[id, mu]` pairs in arbitrary order. */
const ratings = (...entries: [string, number][]) =>
	new Map(entries.map(([id, mu]) => [id, player(id, mu)]))

const ranksOf = (map: Map<string, PlayerRatingState>) =>
	calculateRanksWithTieHandling(map).map(({ player, rank }) => [
		player.playerId,
		rank,
	])

describe('calculateRanksWithTieHandling', () => {
	it('returns nothing for an empty ratings map', () => {
		expect(calculateRanksWithTieHandling(new Map())).toEqual([])
	})

	it('sorts by mu descending regardless of insertion order', () => {
		expect(ranksOf(ratings(['low', 10], ['high', 30], ['mid', 20]))).toEqual([
			['high', 1],
			['mid', 2],
			['low', 3],
		])
	})

	it('gives tied players the same rank and skips the ranks they consume', () => {
		expect(
			ranksOf(ratings(['a', 30], ['b', 30], ['c', 20], ['d', 10], ['e', 10]))
		).toEqual([
			['a', 1],
			['b', 1],
			['c', 3],
			['d', 4],
			['e', 4],
		])
	})

	it('skips by the full size of a group larger than two', () => {
		expect(
			ranksOf(ratings(['a', 30], ['b', 30], ['c', 30], ['d', 30], ['e', 20]))
		).toEqual([
			['a', 1],
			['b', 1],
			['c', 1],
			['d', 1],
			['e', 5],
		])
	})

	it('resumes correct numbering after two consecutive tie groups', () => {
		expect(
			ranksOf(
				ratings(
					['a', 30],
					['b', 30],
					['c', 20],
					['d', 20],
					['e', 20],
					['f', 10]
				)
			)
		).toEqual([
			['a', 1],
			['b', 1],
			['c', 3],
			['d', 3],
			['e', 3],
			['f', 6],
		])
	})

	it('ranks everyone first when every player is tied', () => {
		expect(ranksOf(ratings(['a', 25], ['b', 25], ['c', 25]))).toEqual([
			['a', 1],
			['b', 1],
			['c', 1],
		])
	})

	it('treats ratings that differ below the precision threshold as tied', () => {
		// RATING_PRECISION_MULTIPLIER is 1e6, so a 1e-9 gap rounds away. This
		// matches how the App formats ratings, so two players who look
		// identical on screen are not given different ranks.
		const ranks = ranksOf(ratings(['a', 25], ['b', 25 + 1e-9]))
		expect(ranks.map(([, rank]) => rank)).toEqual([1, 1])
	})

	it('separates ratings that differ above the precision threshold', () => {
		const ranks = ranksOf(ratings(['a', 25], ['b', 25.00001]))
		expect(ranks).toEqual([
			['b', 1],
			['a', 2],
		])
	})
})
