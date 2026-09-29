import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { GameType, type GameDocument, type PlayerRankingRound } from '@/types'
import {
	gameResultFor,
	rankWithTies,
	seasonIdsOf,
	seasonSlots,
} from './ranking-helpers'

/** A stand-in reference: the helpers read only its id. */
const ref = (id: string) => ({ id }) as never

const row = (id: string, playerName: string, rating: number) => ({
	id,
	playerName,
	rating,
})

describe('rankWithTies', () => {
	it('ranks by rating, highest first', () => {
		const ranked = rankWithTies([
			row('b', 'Bea', 30),
			row('a', 'Al', 40),
			row('c', 'Cy', 20),
		])
		expect(ranked.map(({ row, rank }) => [row.id, rank])).toEqual([
			['a', 1],
			['b', 2],
			['c', 3],
		])
	})

	it('gives tied players one rank, by name, and skips the places they take', () => {
		// Teammates who always played together share a rating exactly.
		const ranked = rankWithTies([
			row('z', 'Zoe', 40.86),
			row('a', 'Al', 40.86),
			row('m', 'Mo', 40.86),
			row('d', 'Dee', 39),
		])
		expect(ranked.map(({ row, rank }) => [row.playerName, rank])).toEqual([
			['Al', 1],
			['Mo', 1],
			['Zoe', 1],
			['Dee', 4],
		])
	})

	it('treats ratings equal to the stored precision as tied', () => {
		const ranked = rankWithTies([
			row('a', 'Al', 30.0000001),
			row('b', 'Bea', 30.0000002),
		])
		expect(ranked.map(({ rank }) => rank)).toEqual([1, 1])
	})

	it('gives medals to the top three places, ties included', () => {
		const ranked = rankWithTies([
			row('a', 'Al', 50),
			row('b', 'Bea', 40),
			row('c', 'Cy', 30),
			row('d', 'Dee', 30),
			row('e', 'Eve', 20),
		])
		expect(ranked.map(({ row, medal }) => [row.id, medal])).toEqual([
			['a', true],
			['b', true],
			['c', true],
			['d', true],
			['e', false],
		])
	})

	it('ranks nobody when there is nobody', () => {
		expect(rankWithTies([])).toEqual([])
	})
})

const KICKOFF = new Date('2026-03-28T23:00:00Z')

const game = (overrides: Partial<GameDocument> = {}): GameDocument =>
	({
		home: ref('us'),
		homeName: 'Frost Giants',
		homeScore: 13,
		away: ref('them'),
		awayName: 'Snow Owls',
		awayScore: 9,
		date: Timestamp.fromDate(KICKOFF),
		field: 1,
		season: ref('spring'),
		type: GameType.REGULAR,
		...overrides,
	}) as GameDocument

describe('gameResultFor', () => {
	it('reads a home win', () => {
		expect(gameResultFor(game(), 'us')).toEqual({
			opponent: 'Snow Owls',
			teamScore: 13,
			opponentScore: 9,
			outcome: 'win',
			playoff: false,
		})
	})

	it('reads it from the away side as a loss', () => {
		expect(gameResultFor(game(), 'them')).toMatchObject({
			opponent: 'Frost Giants',
			teamScore: 9,
			opponentScore: 13,
			outcome: 'loss',
		})
	})

	it('reads a tie, and a playoff', () => {
		expect(
			gameResultFor(
				game({ homeScore: 10, awayScore: 10, type: GameType.PLAYOFF }),
				'us'
			)
		).toMatchObject({ outcome: 'tie', playoff: true })
	})

	it('has no result for a team not in the game', () => {
		expect(gameResultFor(game(), 'someone-else')).toBeNull()
	})

	it('has no result for a game without a score yet', () => {
		expect(gameResultFor(game({ homeScore: null }), 'us')).toBeNull()
	})
})

const round = (
	minutes: number,
	overrides: Partial<PlayerRankingRound> = {}
): PlayerRankingRound => {
	const date = new Date(KICKOFF.getTime() + minutes * 60_000)
	return {
		roundId: String(date.getTime()),
		seasonId: 'spring',
		date: Timestamp.fromDate(date),
		rating: 30,
		rank: 10,
		seasonRank: 4,
		change: 0.1,
		totalGames: 20,
		...overrides,
	}
}

describe('seasonSlots', () => {
	it('pairs each of the season’s slots with the game the team played in it', () => {
		const rounds = [round(0), round(45), round(90)]
		const games = [
			game(),
			game({
				date: Timestamp.fromDate(new Date(KICKOFF.getTime() + 90 * 60_000)),
				homeScore: 5,
				awayScore: 12,
			}),
		]

		const slots = seasonSlots(rounds, 'spring', games, 'us')

		expect(slots.map(({ game }) => game?.outcome ?? 'sat out')).toEqual([
			'win',
			'sat out',
			'loss',
		])
	})

	it('keeps only the season asked for', () => {
		const rounds = [round(0), round(45, { seasonId: 'fall' })]

		expect(seasonSlots(rounds, 'spring', [game()], 'us')).toHaveLength(1)
	})

	it('ignores another season’s game at the same time', () => {
		const slots = seasonSlots(
			[round(0)],
			'spring',
			[game({ season: ref('fall') })],
			'us'
		)
		expect(slots[0].game).toBeNull()
	})

	it('shows every slot as sat out when the player had no team', () => {
		const slots = seasonSlots([round(0)], 'spring', [game()], null)
		expect(slots[0].game).toBeNull()
	})
})

describe('seasonIdsOf', () => {
	it('lists the seasons the player was on a roster for, in order', () => {
		expect(
			seasonIdsOf([
				round(0, { seasonId: 'fall-2025' }),
				round(45, { seasonId: 'fall-2025' }),
				round(90, { seasonId: 'spring-2026' }),
			])
		).toEqual(['fall-2025', 'spring-2026'])
	})

	it('leaves out seasons they sat out, where they only drifted', () => {
		expect(
			seasonIdsOf([
				round(0, { seasonId: 'fall-2025' }),
				round(45, { seasonId: 'spring-2026', seasonRank: null }),
			])
		).toEqual(['fall-2025'])
	})
})
