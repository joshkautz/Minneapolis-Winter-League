import { describe, expect, it } from 'vitest'
import { formatRoundInfo, groupGamesByRounds } from './roundGrouper.js'
import { GameProcessingData } from '../types.js'

/**
 * Rounds are what the pipeline decays against: every player not in a round
 * gains a round of inactivity. Grouping games that kicked off together into
 * one round is therefore the difference between one decay step per time slot
 * and one per game, which would penalise a busy evening several times over.
 */

const game = (
	id: string,
	isoDate: string,
	seasonId = 'season-1'
): GameProcessingData =>
	({
		id,
		gameDate: new Date(isoDate),
		season: { id: seasonId },
	}) as unknown as GameProcessingData

describe('groupGamesByRounds', () => {
	it('returns no rounds for no games', () => {
		expect(groupGamesByRounds([])).toEqual([])
	})

	it('groups games that start at the same instant into one round', () => {
		const rounds = groupGamesByRounds([
			game('a', '2030-01-05T18:00:00.000Z'),
			game('b', '2030-01-05T18:00:00.000Z'),
			game('c', '2030-01-05T18:00:00.000Z'),
		])

		expect(rounds).toHaveLength(1)
		expect(rounds[0].games.map((g) => g.id)).toEqual(['a', 'b', 'c'])
	})

	it('splits games a millisecond apart into separate rounds', () => {
		// Grouping is by exact timestamp, so schedule data has to be written
		// with identical start times for a slot. This test records that.
		const rounds = groupGamesByRounds([
			game('a', '2030-01-05T18:00:00.000Z'),
			game('b', '2030-01-05T18:00:00.001Z'),
		])

		expect(rounds).toHaveLength(2)
	})

	it('orders rounds chronologically regardless of input order', () => {
		const rounds = groupGamesByRounds([
			game('late', '2030-01-19T18:00:00.000Z'),
			game('early', '2030-01-05T18:00:00.000Z'),
			game('middle', '2030-01-12T18:00:00.000Z'),
		])

		expect(rounds.map((r) => r.games[0].id)).toEqual([
			'early',
			'middle',
			'late',
		])
	})

	it('carries the season and start time of the round', () => {
		const rounds = groupGamesByRounds([
			game('a', '2030-01-05T18:00:00.000Z', 'season-2030'),
		])

		expect(rounds[0].seasonId).toBe('season-2030')
		expect(rounds[0].startTime.toISOString()).toBe('2030-01-05T18:00:00.000Z')
		expect(rounds[0].roundId).toBe(
			new Date('2030-01-05T18:00:00.000Z').getTime().toString()
		)
	})

	it('keeps rounds from different seasons separate even when interleaved', () => {
		const rounds = groupGamesByRounds([
			game('old', '2029-01-05T18:00:00.000Z', 'season-2029'),
			game('new', '2030-01-05T18:00:00.000Z', 'season-2030'),
		])

		expect(rounds.map((r) => r.seasonId)).toEqual([
			'season-2029',
			'season-2030',
		])
	})
})

describe('formatRoundInfo', () => {
	it('names the season, start time and game count', () => {
		const [round] = groupGamesByRounds([
			game('a', '2030-01-05T18:00:00.000Z', 'season-2030'),
			game('b', '2030-01-05T18:00:00.000Z', 'season-2030'),
		])

		expect(formatRoundInfo(round)).toBe(
			'Season season-2030 - 2030-01-05T18:00:00.000Z (2 games)'
		)
	})
})
