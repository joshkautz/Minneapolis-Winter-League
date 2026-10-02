import { describe, expect, it } from 'vitest'
import { GameType } from '../../types.js'
import { leagueNights } from '../../shared/leagueCalendar.js'
import {
	planPlayoffs,
	planRegularSeason,
	ScheduleError,
	splitNights,
	stageStarted,
	type PlannedGame,
	type ScheduleTeam,
	type StoredGame,
} from './plan.js'
import { seedTeams } from './standings.js'
import { REGULAR_SEASON_TABLES } from './templates.js'

/**
 * What a twelve-team season's schedule calls for, stage by stage, against
 * Season 5's calendar: four regular-season nights from 7 November, pool
 * night on 12 December and championship night on 19 December.
 */

const NIGHTS = splitNights(
	leagueNights(
		new Date('2026-11-07T06:00:00Z'),
		new Date('2026-12-20T06:00:00Z')
	)
)

/** t01 registered first, t12 last. */
const TEAMS: ScheduleTeam[] = Array.from({ length: 12 }, (_, i) => {
	const n = String(i + 1).padStart(2, '0')
	return {
		teamId: `t${n}`,
		name: `Team ${n}`,
		registeredDate: new Date(Date.UTC(2026, 9, 1, 5, 0, i)),
		rating: null,
	}
})

let gameCount = 0
/** A planned game as stored, scored by `score` if given. */
const stored = (
	game: PlannedGame,
	score?: (game: PlannedGame) => [number, number]
): StoredGame => {
	const [homeScore, awayScore] = score ? score(game) : [null, null]
	return {
		id: `game-${++gameCount}`,
		date: game.date,
		field: game.field,
		type: game.type,
		homeTeamId: game.homeTeamId,
		awayTeamId: game.awayTeamId,
		homeScore,
		awayScore,
		playoffSlot: game.playoffSlot,
	}
}

/** The home team wins every game, by a margin that varies with the slot. */
const homeWins = (game: PlannedGame): [number, number] => [
	13,
	12 - game.field - (game.date.getUTCHours() % 4),
]

/** The team registered earlier wins: a clear order of strength. */
const strongerWins = (game: PlannedGame): [number, number] =>
	game.homeTeamId < game.awayTeamId ? [13, 6] : [6, 13]

const REGULAR = planRegularSeason(NIGHTS, TEAMS)
const playedRegular = REGULAR.map((game) => stored(game, strongerWins))
const SEEDS = seedTeams(
	TEAMS,
	playedRegular.map((game) => ({
		homeTeamId: game.homeTeamId as string,
		awayTeamId: game.awayTeamId as string,
		homeScore: game.homeScore as number,
		awayScore: game.awayScore as number,
	}))
)
const seed = (n: number): string => SEEDS[n - 1]

const slotOf = (plan: { games: PlannedGame[] }, slot: string) =>
	plan.games.find((game) => game.playoffSlot === slot)

describe('splitNights', () => {
	it('makes the last two nights the playoffs', () => {
		expect(NIGHTS.regular.map((d) => d.toISOString().slice(0, 10))).toEqual([
			'2026-11-07',
			'2026-11-14',
			'2026-11-21',
			'2026-12-05',
		])
		expect(NIGHTS.poolNight.toISOString().slice(0, 10)).toBe('2026-12-12')
		expect(NIGHTS.championshipNight.toISOString().slice(0, 10)).toBe(
			'2026-12-19'
		)
	})

	it('refuses a season with a number of nights there is no table for', () => {
		const nights = (count: number) =>
			Array.from(
				{ length: count },
				(_, i) => new Date(Date.UTC(2026, 10, 7 + 7 * i))
			)
		expect(() => splitNights(nights(5))).toThrow(ScheduleError)
		expect(() => splitNights(nights(8))).toThrow(
			'This season has 8 Saturdays of games'
		)
		expect(() => splitNights(nights(7))).not.toThrow()
	})
})

describe('planRegularSeason', () => {
	it('schedules all 48 games, twelve a night at the four time slots', () => {
		expect(REGULAR).toHaveLength(48)
		const first = REGULAR.slice(0, 12)
		expect([...new Set(first.map((g) => g.date.toISOString()))]).toEqual([
			'2026-11-08T00:00:00.000Z',
			'2026-11-08T00:45:00.000Z',
			'2026-11-08T01:30:00.000Z',
			'2026-11-08T02:15:00.000Z',
		])
		expect(first.slice(0, 3).map((g) => g.field)).toEqual([1, 2, 3])
		expect(
			REGULAR.every((g) => g.type === GameType.REGULAR && !g.playoffSlot)
		).toBe(true)
	})

	it('numbers teams by when they registered', () => {
		const [home, away] = REGULAR_SEASON_TABLES[4][0][0][0]
		expect(REGULAR[0]).toMatchObject({
			homeTeamId: TEAMS[home - 1].teamId,
			awayTeamId: TEAMS[away - 1].teamId,
		})
		// The order the teams are given in does not matter.
		expect(planRegularSeason(NIGHTS, [...TEAMS].reverse())).toEqual(REGULAR)
	})

	it('needs twelve teams', () => {
		expect(() => planRegularSeason(NIGHTS, TEAMS.slice(1))).toThrow(
			'A schedule needs 12 registered teams; this season has 11.'
		)
	})
})

describe('planPlayoffs', () => {
	it('plans nothing for a season with no games yet', () => {
		const plan = planPlayoffs(NIGHTS, TEAMS, [])
		expect(plan.games).toEqual([])
		expect(plan.waitingFor).toBe('every regular-season game to have a score')
	})

	it('plans nothing until every regular-season game has a score', () => {
		const games = [...playedRegular]
		games[47] = { ...games[47], awayScore: null }
		const plan = planPlayoffs(NIGHTS, TEAMS, games)
		expect(plan).toMatchObject({ seeds: null, games: [], placements: null })
		expect(plan.waitingFor).toBe('every regular-season game to have a score')
	})

	it('plans pool night from the seeds once the regular season is over', () => {
		const plan = planPlayoffs(NIGHTS, TEAMS, playedRegular)
		expect(plan.seeds).toEqual(SEEDS)
		expect(plan.games).toHaveLength(12)
		expect(slotOf(plan, 'pool-r1-f1')).toMatchObject({
			homeTeamId: seed(1),
			awayTeamId: seed(8),
			field: 1,
			type: GameType.PLAYOFF,
			date: new Date('2026-12-13T00:00:00Z'),
		})
		expect(slotOf(plan, 'pool-r4-f3')).toMatchObject({
			homeTeamId: seed(2),
			awayTeamId: seed(10),
			field: 3,
			date: new Date('2026-12-13T02:15:00Z'),
		})
		expect(plan.waitingFor).toBe('every pool-night game to have a score')
	})

	const poolPlan = planPlayoffs(NIGHTS, TEAMS, playedRegular)
	/** Pool night played: the better seed wins every game. */
	const playedPools = poolPlan.games.map((game) =>
		stored(game, (g) =>
			SEEDS.indexOf(g.homeTeamId) < SEEDS.indexOf(g.awayTeamId)
				? [11, 7]
				: [7, 11]
		)
	)

	it('plans championship night’s first games from the pools', () => {
		const plan = planPlayoffs(NIGHTS, TEAMS, [...playedRegular, ...playedPools])
		const championship = plan.games.filter((g) =>
			g.playoffSlot?.startsWith('championship-')
		)
		expect(championship).toHaveLength(6)
		// Each pool's winner was its top seed: 1, 2, 3 and 4.
		expect(slotOf(plan, 'championship-r1-f1')).toMatchObject({
			homeTeamId: seed(1),
			awayTeamId: seed(4),
			date: new Date('2026-12-20T00:00:00Z'),
		})
		expect(slotOf(plan, 'championship-r2-f1')).toMatchObject({
			homeTeamId: seed(2),
			awayTeamId: seed(3),
		})
		// Pool seconds: 8, 7, 6 and 5.
		expect(slotOf(plan, 'championship-r1-f2')).toMatchObject({
			homeTeamId: seed(8),
			awayTeamId: seed(5),
			field: 2,
		})
		expect(slotOf(plan, 'championship-r2-f3')).toMatchObject({
			homeTeamId: seed(10),
			awayTeamId: seed(11),
			field: 3,
		})
	})

	it('waits for every pool game, and reads the pools from their results', () => {
		const unfinished = playedPools.map((game, i) =>
			i === 0 ? { ...game, homeScore: null, awayScore: null } : game
		)
		expect(
			planPlayoffs(NIGHTS, TEAMS, [...playedRegular, ...unfinished]).games
		).toHaveLength(12)

		// Seed 9 wins both its pool games, and so tops pool 1.
		const upset = playedPools.map((game) =>
			game.homeTeamId === seed(9) || game.awayTeamId === seed(9)
				? {
						...game,
						homeScore: game.homeTeamId === seed(9) ? 11 : 7,
						awayScore: game.homeTeamId === seed(9) ? 7 : 11,
					}
				: game
		)
		const plan = planPlayoffs(NIGHTS, TEAMS, [...playedRegular, ...upset])
		expect(slotOf(plan, 'championship-r1-f1')?.homeTeamId).toBe(seed(9))
		expect(slotOf(plan, 'championship-r1-f2')?.homeTeamId).toBe(seed(1))
		expect(slotOf(plan, 'championship-r1-f3')?.homeTeamId).toBe(seed(8))
	})

	it('ranks each pool with the teams its games were actually played by', () => {
		// An admin swaps seed 9 for seed 12 in pool 1's last game. Pool 1 is
		// then 1, 8 and 12 — and pool 4 lost seed 12 — so no four pools.
		const edited = playedPools.map((game) =>
			game.playoffSlot === 'pool-r3-f1'
				? { ...game, awayTeamId: seed(12) }
				: game
		)
		const plan = planPlayoffs(NIGHTS, TEAMS, [...playedRegular, ...edited])
		expect(plan.waitingFor).toMatch(/form four pools of three/)
		expect(
			plan.games.some((g) => g.playoffSlot?.startsWith('championship-'))
		).toBe(false)
	})

	it('tells when a night has started', () => {
		expect(stageStarted(playedPools, 'pool')).toBe(true)
		expect(stageStarted(playedPools, 'championship')).toBe(false)
		const unplayed = poolPlan.games.map((game) => stored(game))
		expect(stageStarted(unplayed, 'pool')).toBe(false)
		// One score is enough.
		unplayed[5] = { ...unplayed[5], homeScore: 4 }
		expect(stageStarted(unplayed, 'pool')).toBe(true)
	})

	const firstRounds = planPlayoffs(NIGHTS, TEAMS, [
		...playedRegular,
		...playedPools,
	])
		.games.filter((g) => g.playoffSlot?.startsWith('championship-'))
		.map((game) => stored(game, homeWins))

	it('plans a field’s last two games once its first two have winners', () => {
		// Field 2's second game is not in yet.
		const games = firstRounds.map((game) =>
			game.playoffSlot === 'championship-r2-f2'
				? { ...game, homeScore: null, awayScore: null }
				: game
		)
		const plan = planPlayoffs(NIGHTS, TEAMS, [
			...playedRegular,
			...playedPools,
			...games,
		])
		expect(slotOf(plan, 'championship-r4-f1')).toMatchObject({
			homeTeamId: seed(1),
			awayTeamId: seed(2),
			date: new Date('2026-12-20T02:15:00Z'),
		})
		expect(slotOf(plan, 'championship-r3-f1')).toMatchObject({
			homeTeamId: seed(4),
			awayTeamId: seed(3),
		})
		expect(slotOf(plan, 'championship-r3-f2')).toBeUndefined()
		expect(slotOf(plan, 'championship-r4-f3')).toBeDefined()
		expect(plan.placements).toBeNull()
	})

	it('waits on a level championship game, which decides nothing', () => {
		const games = firstRounds.map((game) =>
			game.playoffSlot === 'championship-r1-f3'
				? { ...game, homeScore: 9, awayScore: 9 }
				: game
		)
		const plan = planPlayoffs(NIGHTS, TEAMS, [
			...playedRegular,
			...playedPools,
			...games,
		])
		expect(slotOf(plan, 'championship-r4-f3')).toBeUndefined()
		expect(plan.waitingFor).toContain(
			"both of field 3's first championship games to have a winner"
		)
	})

	it('places nobody if championship night no longer places each team once', () => {
		const lastRounds = planPlayoffs(NIGHTS, TEAMS, [
			...playedRegular,
			...playedPools,
			...firstRounds,
		])
			.games.filter((g) => /championship-r[34]-/.test(g.playoffSlot ?? ''))
			.map((game) => stored(game, homeWins))
			// An admin puts field 1's finalist into field 2's final by hand.
			.map((game) =>
				game.playoffSlot === 'championship-r4-f2'
					? { ...game, homeTeamId: seed(1) }
					: game
			)
		const plan = planPlayoffs(NIGHTS, TEAMS, [
			...playedRegular,
			...playedPools,
			...firstRounds,
			...lastRounds,
		])
		expect(plan.placements).toBeNull()
		expect(plan.waitingFor).toMatch(/place each team once/)
	})

	it('places all twelve teams once championship night is decided', () => {
		const lastRounds = planPlayoffs(NIGHTS, TEAMS, [
			...playedRegular,
			...playedPools,
			...firstRounds,
		])
			.games.filter((g) => /championship-r[34]-/.test(g.playoffSlot ?? ''))
			.map((game) => stored(game, homeWins))
		const plan = planPlayoffs(NIGHTS, TEAMS, [
			...playedRegular,
			...playedPools,
			...firstRounds,
			...lastRounds,
		])
		expect(plan.waitingFor).toBeNull()
		// The home team won every game: field 1's final was seed 1 v seed 2,
		// its third-place game seed 4 v seed 3.
		expect(
			Object.fromEntries(
				[...(plan.placements ?? [])].map(([id, place]) => [
					place,
					SEEDS.indexOf(id) + 1,
				])
			)
		).toEqual({
			1: 1,
			2: 2,
			3: 4,
			4: 3,
			5: 8,
			6: 7,
			7: 5,
			8: 6,
			9: 9,
			10: 10,
			11: 12,
			12: 11,
		})
	})
})
