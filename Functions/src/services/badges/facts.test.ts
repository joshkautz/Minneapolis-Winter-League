import { describe, expect, it } from 'vitest'
import type { GameDocument } from '../../types.js'
import { playedGame, ratingLookup } from './facts.js'

const ref = (id: string) => ({ id }) as GameDocument['home']
const at = (iso: string) => ({ toDate: () => new Date(iso) })

const game = (overrides: Partial<GameDocument> = {}): GameDocument =>
	({
		home: ref('home'),
		away: ref('away'),
		homeScore: 10,
		awayScore: 5,
		season: { id: 'fall' },
		date: at('2026-11-07T18:00:00Z'),
		type: 'regular',
		...overrides,
	}) as GameDocument

describe('playedGame', () => {
	it('keeps a game with both teams and both scores', () => {
		expect(playedGame('g1', game())).toMatchObject({
			id: 'g1',
			seasonId: 'fall',
			homeTeamId: 'home',
			awayTeamId: 'away',
			homeScore: 10,
			awayScore: 5,
		})
	})

	it.each([
		['a forfeit', { forfeit: 'away' as const }],
		['an unrecorded score', { awayScore: null }],
		['a missing team', { home: null }],
	])('drops %s, which nobody really played', (_, overrides) => {
		expect(playedGame('g1', game(overrides))).toBeNull()
	})

	it('keeps a game whose forfeit was cleared', () => {
		expect(playedGame('g1', game({ forfeit: null }))).not.toBeNull()
	})
})

describe('ratingLookup', () => {
	const ratingBefore = ratingLookup(
		new Map([
			[
				'p1',
				[
					{ date: new Date('2026-11-07T18:00:00Z'), rating: 25 },
					{ date: new Date('2026-11-14T18:00:00Z'), rating: 27 },
				],
			],
		])
	)

	it('gives the rating held just before the moment', () => {
		expect(ratingBefore('p1', new Date('2026-11-14T18:00:00Z'))).toBe(25)
		expect(ratingBefore('p1', new Date('2026-12-01T00:00:00Z'))).toBe(27)
	})

	it('gives null before a player’s first round, or for an unrated player', () => {
		expect(ratingBefore('p1', new Date('2026-11-01T00:00:00Z'))).toBeNull()
		expect(ratingBefore('nobody', new Date())).toBeNull()
	})
})
