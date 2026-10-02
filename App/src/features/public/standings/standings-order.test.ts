import { describe, expect, it } from 'vitest'
import type { QuerySnapshot } from 'firebase/firestore'
import type { TeamStanding } from '@/shared/hooks'
import type { GameDocument, TeamSeasonDocument } from '@/types'
import {
	byStandings,
	nightsIn,
	standingsRanks,
	weeksLabel,
	withRankedTeams,
} from './standings-order'

/**
 * The Standings page's order: a generated season's teams listed, 0–0, in
 * the server's order before the first game, and by it after; any other
 * season by wins and point differential, as it always was.
 */

const teamSeason = (teamId: string, standingsRank?: number) => ({
	id: 'season-5',
	ref: { parent: { parent: { id: teamId } } },
	data: () => ({ name: teamId, standingsRank }) as TeamSeasonDocument,
})

const snapshotOf = <T>(docs: unknown[]) =>
	({ docs }) as unknown as QuerySnapshot<T>

const record = (wins: number, differential: number): TeamStanding => ({
	wins,
	losses: 0,
	differential,
	pointsFor: 0,
	pointsAgainst: 0,
})

describe('standingsRanks', () => {
	it('reads each ranked team’s rank, by team id', () => {
		const ranks = standingsRanks(
			snapshotOf<TeamSeasonDocument>([
				teamSeason('chao', 2),
				teamSeason('goop', 1),
				teamSeason('unranked'),
			])
		)
		expect([...ranks]).toEqual([
			['chao', 2],
			['goop', 1],
		])
	})
})

describe('withRankedTeams', () => {
	it('adds a 0–0 row for every ranked team yet to play', () => {
		const all = withRankedTeams(
			{ chao: record(1, 4) },
			new Map([
				['chao', 1],
				['goop', 2],
			])
		)
		expect(all.chao.wins).toBe(1)
		expect(all.goop).toMatchObject({ wins: 0, losses: 0, differential: 0 })
	})
})

describe('byStandings', () => {
	it('orders ranked teams by rank, even against their record', () => {
		const sorted = Object.entries({ a: record(0, 0), b: record(3, 20) }).sort(
			byStandings(
				new Map([
					['a', 1],
					['b', 2],
				])
			)
		)
		expect(sorted.map(([id]) => id)).toEqual(['a', 'b'])
	})

	it('orders a season without ranks by wins, then differential', () => {
		const sorted = Object.entries({
			a: record(1, 9),
			b: record(2, -3),
			c: record(1, 12),
		}).sort(byStandings(new Map()))
		expect(sorted.map(([id]) => id)).toEqual(['b', 'c', 'a'])
	})
})

describe('nightsIn', () => {
	it('counts nights on Minneapolis’s calendar, so 8:15pm is still that night', () => {
		const game = (iso: string) => ({
			data: () => ({ date: { toDate: () => new Date(iso) } }),
		})
		expect(
			nightsIn(
				snapshotOf<GameDocument>([
					game('2026-11-08T00:00:00Z'),
					game('2026-11-08T02:15:00Z'),
					game('2026-11-15T00:00:00Z'),
				])
			)
		).toBe(2)
	})
})

describe('weeksLabel', () => {
	it('names one week or a range', () => {
		expect(weeksLabel(1, 4)).toBe('Weeks 1–4')
		expect(weeksLabel(5, 1)).toBe('Week 5')
		expect(weeksLabel(5, 2)).toBe('Weeks 5–6')
	})
})
