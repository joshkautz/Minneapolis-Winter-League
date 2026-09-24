import { describe, expect, it } from 'vitest'
import type { DocumentReference } from 'firebase/firestore'
import type { GameDocument } from '@/types'
import { sortBySeasonStartDesc, teamRecordsBySeason } from './game-utils'

/**
 * Team records shown on the player and team pages. The bug these pin: a
 * team keeps one id across the seasons it rolls over into, and tallying by
 * team id alone credited every season's games to each season's row — a
 * 11-1 season read as 48-4.
 */

const ref = (id: string) => ({ id }) as unknown as DocumentReference

const game = (
	season: string,
	home: string | null,
	away: string | null,
	homeScore: number | null,
	awayScore: number | null,
	type: 'regular' | 'playoff' = 'regular'
): GameDocument =>
	({
		season: ref(season),
		home: home ? ref(home) : null,
		away: away ? ref(away) : null,
		homeScore,
		awayScore,
		type,
	}) as unknown as GameDocument

describe('teamRecordsBySeason', () => {
	it('keeps each season separate for a team that rolled over', () => {
		const games = [
			game('fall-2025', 'surly', 'other', 13, 5),
			game('fall-2025', 'other', 'surly', 13, 9),
			game('spring-2026', 'surly', 'other', 13, 2),
		]
		expect(teamRecordsBySeason(games, 'surly')).toEqual({
			'fall-2025': { wins: 1, losses: 1 },
			'spring-2026': { wins: 1, losses: 0 },
		})
	})

	it('credits the right side whether the team is home or away', () => {
		const games = [
			game('s', 'us', 'them', 13, 10),
			game('s', 'them', 'us', 13, 10),
			game('s', 'them', 'us', 8, 13),
		]
		expect(teamRecordsBySeason(games, 'us').s).toEqual({ wins: 2, losses: 1 })
	})

	it('counts playoff games as part of the season', () => {
		const games = [
			game('s', 'us', 'them', 13, 10, 'regular'),
			game('s', 'us', 'them', 13, 11, 'playoff'),
		]
		expect(teamRecordsBySeason(games, 'us').s).toEqual({ wins: 2, losses: 0 })
	})

	it('ignores other teams’ games', () => {
		expect(teamRecordsBySeason([game('s', 'a', 'b', 13, 1)], 'us')).toEqual({})
	})

	it('skips unplayed and placeholder games', () => {
		const games = [
			game('s', 'us', 'them', null, null),
			game('s', 'us', null, 13, 0),
			game('s', null, 'us', 0, 13),
		]
		expect(teamRecordsBySeason(games, 'us')).toEqual({})
	})

	it('credits neither side for a tie', () => {
		expect(
			teamRecordsBySeason([game('s', 'us', 'them', 10, 10)], 'us')
		).toEqual({
			s: { wins: 0, losses: 0 },
		})
	})
})

describe('sortBySeasonStartDesc', () => {
	const start = { fall26: 300, spring26: 200, fall25: 100 }
	type Entry = { id: keyof typeof start | 'unknown'; name: string }
	const startOf = (entry: Entry) =>
		entry.id === 'unknown' ? undefined : start[entry.id]

	it('puts the newest season first, whatever the names say', () => {
		// By name, "2026 Spring" sorts before "2026 Fall"; by date it is older.
		const entries: Entry[] = [
			{ id: 'spring26', name: '2026 Spring' },
			{ id: 'fall25', name: '2025 Fall' },
			{ id: 'fall26', name: '2026 Fall' },
		]
		expect(sortBySeasonStartDesc(entries, startOf).map((e) => e.name)).toEqual([
			'2026 Fall',
			'2026 Spring',
			'2025 Fall',
		])
	})

	it.each([
		['first', ['unknown', 'fall25', 'fall26']],
		['in the middle', ['fall25', 'unknown', 'fall26']],
		['last', ['fall25', 'fall26', 'unknown']],
	] as const)(
		'puts seasons with no known start last, wherever they begin (%s)',
		(_position, ids) => {
			const entries: Entry[] = ids.map((id) => ({ id, name: id }))
			expect(sortBySeasonStartDesc(entries, startOf).map((e) => e.id)).toEqual([
				'fall26',
				'fall25',
				'unknown',
			])
		}
	)

	it('does not reorder the input array', () => {
		const entries: Entry[] = [
			{ id: 'fall25', name: '2025 Fall' },
			{ id: 'fall26', name: '2026 Fall' },
		]
		sortBySeasonStartDesc(entries, startOf)
		expect(entries[0].id).toBe('fall25')
	})
})
