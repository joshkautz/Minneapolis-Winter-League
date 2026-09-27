import { describe, expect, it } from 'vitest'
import { TRUESKILL_CONSTANTS } from '../constants.js'
import { projectRankings } from './projections.js'
import {
	rosterKey,
	runRankings,
	type EngineGame,
	type EngineInput,
} from './rankingEngine.js'

/** The value, failing the test by name when it is missing. */
const must = <T>(value: T | null | undefined): T => {
	if (value === undefined || value === null) throw new Error('missing value')
	return value
}

const BASELINE = TRUESKILL_CONSTANTS.INITIAL_MU
const TIME_ZONE = 'America/Chicago'

let gameCount = 0
const game = (
	seasonId: string,
	date: string,
	home: string,
	away: string
): EngineGame => ({
	id: `game-${++gameCount}`,
	seasonId,
	date: new Date(date),
	type: 'regular',
	homeTeamId: home,
	awayTeamId: away,
	homeScore: 15,
	awayScore: 10,
})

/** Teams named by their only player; `rostered` adds benchwarmers. */
const project = (games: EngineGame[], rostered: [string, string[]][] = []) => {
	const rosters = new Map<string, string[]>()
	const names = new Map<string, string>()
	const seasonRosters = new Map<string, Set<string>>()
	const addToSeason = (seasonId: string, playerId: string): void => {
		seasonRosters.set(
			seasonId,
			(seasonRosters.get(seasonId) ?? new Set()).add(playerId)
		)
		names.set(playerId, playerId)
	}
	for (const g of games) {
		for (const team of [g.homeTeamId, g.awayTeamId]) {
			if (!team) continue
			rosters.set(rosterKey(team, g.seasonId), [team])
			addToSeason(g.seasonId, team)
		}
	}
	for (const [seasonId, players] of rostered) {
		for (const player of players) addToSeason(seasonId, player)
	}
	const input: EngineInput = { games, rosters, playerNames: names }
	const result = runRankings(input)
	return { result, ...projectRankings(result, seasonRosters, TIME_ZONE) }
}

// Two seasons: a beats b in s1; in s2 c beats a, and b does not play.
const twoSeasons = [
	game('s1', '2030-01-05T18:00:00Z', 'a', 'b'),
	game('s2', '2031-01-04T18:00:00Z', 'c', 'a'),
]

describe('projectRankings: histories', () => {
	it('keeps a point for every round since the player first played', () => {
		const { histories } = project(twoSeasons)
		expect(histories.get('a')).toHaveLength(2)
		expect(histories.get('c')).toHaveLength(1)
	})

	it('adds up the changes to the rating, carry-over included', () => {
		const { histories } = project(twoSeasons)
		const points = must(histories.get('a'))
		const total = points.reduce((sum, point) => sum + point.change, 0)
		expect(BASELINE + total).toBeCloseTo(must(points.at(-1)).rating, 10)
	})

	it('ranks within the season only among its rostered players', () => {
		const { histories } = project(twoSeasons)
		// b is rated but not on an s2 roster: no season rank there, and not
		// counted in a's, so a is second of two behind c.
		const bInS2 = must(histories.get('b')).find(
			(point) => point.seasonId === 's2'
		)
		expect(bInS2?.seasonRank).toBeNull()
		const aInS2 = must(histories.get('a')).find(
			(point) => point.seasonId === 's2'
		)
		expect(aInS2?.seasonRank).toBe(2)
	})

	it('ranks all-time among every rated player', () => {
		const { histories } = project(twoSeasons)
		const ranks = ['a', 'b', 'c'].map(
			(id) => must(must(histories.get(id)).at(-1)).rank
		)
		expect([...ranks].sort()).toEqual([1, 2, 3])
	})
})

describe('projectRankings: season standings', () => {
	it("lists the season's rostered players, best first", () => {
		const { seasons } = project(twoSeasons)
		expect(seasons.get('s2')?.map((standing) => standing.playerId)).toEqual([
			'c',
			'a',
		])
	})

	it('leaves out a rostered player who has never been rated', () => {
		const { seasons } = project(twoSeasons, [['s2', ['newcomer']]])
		expect(
			seasons.get('s2')?.some((standing) => standing.playerId === 'newcomer')
		).toBe(false)
	})

	it('includes a rostered player rated in an earlier season who has not played yet', () => {
		const { seasons } = project(twoSeasons, [['s2', ['b']]])
		const b = seasons.get('s2')?.find((standing) => standing.playerId === 'b')
		expect(b).toMatchObject({ games: 0, wins: 0, losses: 0 })
	})

	it("records each player's games, wins and losses that season", () => {
		const { seasons } = project(twoSeasons)
		const a = seasons.get('s2')?.find((standing) => standing.playerId === 'a')
		expect(a).toMatchObject({ games: 1, wins: 0, losses: 1 })
	})

	it('measures the change from the rating carried into the season', () => {
		const { seasons, histories } = project(twoSeasons)
		const endOfS1 = must(histories.get('a'))[0].rating
		const carried =
			BASELINE + (endOfS1 - BASELINE) * TRUESKILL_CONSTANTS.SEASON_CARRY_OVER
		const a = seasons.get('s2')?.find((standing) => standing.playerId === 'a')
		expect(a?.ratingChange).toBeCloseTo(must(a).rating - carried, 10)
	})

	it('measures a new player from the baseline', () => {
		const { seasons } = project(twoSeasons)
		const c = seasons.get('s2')?.find((standing) => standing.playerId === 'c')
		expect(c?.ratingChange).toBeCloseTo(must(c).rating - BASELINE, 10)
	})

	it('has no standings for a season without games', () => {
		const { seasons } = project(twoSeasons, [['s3', ['a']]])
		expect(seasons.has('s3')).toBe(false)
	})
})

describe('projectRankings: final rankings', () => {
	it('measures the last change over the whole latest game night', () => {
		// Two rounds the same evening in Minneapolis, a week after another.
		const { final, histories } = project([
			game('s1', '2030-01-05T00:00:00Z', 'a', 'b'),
			game('s1', '2030-01-12T00:00:00Z', 'a', 'b'),
			game('s1', '2030-01-12T01:00:00Z', 'a', 'b'),
		])
		const points = must(histories.get('a'))
		const a = final.find((ranking) => ranking.playerId === 'a')
		expect(a?.lastRatingChange).toBeCloseTo(
			points[2].rating - points[0].rating,
			10
		)
	})

	it("counts a game night in the league's time zone", () => {
		// 11pm and 1am UTC on consecutive UTC days are both the evening of
		// 4 January in Minneapolis, so they are one game night.
		const { final, histories } = project([
			game('s1', '2029-12-28T23:00:00Z', 'a', 'b'),
			game('s1', '2030-01-04T23:00:00Z', 'a', 'b'),
			game('s1', '2030-01-05T01:00:00Z', 'a', 'b'),
		])
		const points = must(histories.get('a'))
		expect(final.find((r) => r.playerId === 'a')?.lastRatingChange).toBeCloseTo(
			points[2].rating - points[0].rating,
			10
		)
	})

	it('measures a first game night from the baseline', () => {
		const { final } = project([game('s1', '2030-01-05T18:00:00Z', 'a', 'b')])
		const a = must(final.find((ranking) => ranking.playerId === 'a'))
		expect(a.lastRatingChange).toBeCloseTo(a.rating - BASELINE, 10)
	})

	it('is the same however many times it is computed', () => {
		const first = project(twoSeasons).final
		const second = project(twoSeasons).final
		expect(second).toEqual(first)
	})

	it('is empty with no games', () => {
		expect(project([]).final).toEqual([])
	})
})
