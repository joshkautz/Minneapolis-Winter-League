/**
 * What games a season should have: the regular season from its table, and
 * each playoff night from the results that decide it.
 *
 * Pure functions of the season's teams, nights and stored games, so
 * `sync.ts` only has to make Firestore match what these return.
 */

import { GAME_CONFIG } from '../../config/constants.js'
import { leagueInstant } from '../../shared/leagueCalendar.js'
import { GameType } from '../../types.js'
import {
	decided,
	rankPool,
	seedTeams,
	type ScoredGame,
	type SeedableTeam,
} from './standings.js'
import {
	CHAMPIONSHIP_POOL_GAMES,
	PLACES_PER_FIELD,
	PLAYOFF_NIGHTS,
	POOL_NIGHT,
	POOLS,
	REGULAR_SEASON_TABLES,
	SCHEDULE_TEAMS,
	type NumberedNight,
} from './templates.js'

/** A registered team, as scheduling sees it. */
export interface ScheduleTeam extends SeedableTeam {
	name: string
}

/** A game already stored for the season. */
export interface StoredGame {
	id: string
	date: Date
	field: number
	type: GameType
	homeTeamId: string | null
	awayTeamId: string | null
	homeScore: number | null
	awayScore: number | null
	/** Which generated playoff game this is; null for any other game. */
	playoffSlot: string | null
}

/** A game the schedule calls for. */
export interface PlannedGame {
	date: Date
	field: number
	type: GameType
	homeTeamId: string
	awayTeamId: string
	playoffSlot: string | null
}

/** A season's game nights, split into what each is for. */
export interface SeasonNights {
	regular: Date[]
	poolNight: Date
	championshipNight: Date
}

/** A season that cannot be scheduled as it stands, said for an admin. */
export class ScheduleError extends Error {}

/**
 * Splits a season's nights: the last two are the playoffs, the rest the
 * regular season, which must be a length there is a table for.
 */
export function splitNights(nights: readonly Date[]): SeasonNights {
	const regular = nights.slice(0, -PLAYOFF_NIGHTS)
	if (!REGULAR_SEASON_TABLES[regular.length]) {
		const lengths = Object.keys(REGULAR_SEASON_TABLES)
			.map((weeks) => Number(weeks) + PLAYOFF_NIGHTS)
			.join(' or ')
		throw new ScheduleError(
			`This season has ${nights.length} Saturdays of games, not counting the one after Thanksgiving. A schedule can be generated for ${lengths}.`
		)
	}
	return {
		regular,
		poolNight: nights[nights.length - 2],
		championshipNight: nights[nights.length - 1],
	}
}

const requireFullLeague = (teams: readonly ScheduleTeam[]): void => {
	if (teams.length !== SCHEDULE_TEAMS) {
		throw new ScheduleError(
			`A schedule needs ${SCHEDULE_TEAMS} registered teams; this season has ${teams.length}.`
		)
	}
}

/** Round 1 is the first time slot, 6:00pm. */
const kickoff = (night: Date, round: number): Date =>
	leagueInstant(night, GAME_CONFIG.ALLOWED_TIME_SLOTS[round])

/** A night's games from a numbered table, numbers resolved by `teamAt`. */
const nightOf = (
	night: Date,
	table: NumberedNight,
	teamAt: (number: number) => string,
	type: GameType,
	stage: PlayoffStage | null
): PlannedGame[] =>
	table.flatMap((round, roundIndex) =>
		round.map(([home, away], fieldIndex) => ({
			date: kickoff(night, roundIndex),
			field: GAME_CONFIG.ALLOWED_FIELDS[fieldIndex],
			type,
			homeTeamId: teamAt(home),
			awayTeamId: teamAt(away),
			playoffSlot: stage ? playoffSlot(stage, roundIndex, fieldIndex) : null,
		}))
	)

export type PlayoffStage = 'pool' | 'championship'

/** "pool-r1-f2": round and field, both from 1. */
export const playoffSlot = (
	stage: PlayoffStage,
	roundIndex: number,
	fieldIndex: number
): string => `${stage}-r${roundIndex + 1}-f${fieldIndex + 1}`

/** Teams numbered 1–12 in the order they registered. */
const numbered = (teams: readonly ScheduleTeam[]): string[] =>
	[...teams]
		.sort(
			(a, b) =>
				(a.registeredDate?.getTime() ?? Number.POSITIVE_INFINITY) -
					(b.registeredDate?.getTime() ?? Number.POSITIVE_INFINITY) ||
				a.teamId.localeCompare(b.teamId)
		)
		.map((team) => team.teamId)

/** Every regular-season game, teams numbered in registration order. */
export function planRegularSeason(
	nights: SeasonNights,
	teams: readonly ScheduleTeam[]
): PlannedGame[] {
	requireFullLeague(teams)
	const order = numbered(teams)
	const table = REGULAR_SEASON_TABLES[nights.regular.length]
	return nights.regular.flatMap((night, week) =>
		nightOf(
			night,
			table[week],
			(number) => order[number - 1],
			GameType.REGULAR,
			null
		)
	)
}

/** A stored game's result, if it has both teams and both scores. */
export const scoredGame = (game: StoredGame): ScoredGame | null =>
	game.homeTeamId !== null &&
	game.awayTeamId !== null &&
	game.homeScore !== null &&
	game.awayScore !== null
		? {
				homeTeamId: game.homeTeamId,
				awayTeamId: game.awayTeamId,
				homeScore: game.homeScore,
				awayScore: game.awayScore,
			}
		: null

/** What the playoff results so far decide. */
export interface PlayoffPlan {
	/** Regular-season seeds, best first, once the regular season is over. */
	seeds: string[] | null
	/** Every playoff game the results so far decide. */
	games: PlannedGame[]
	/** Each team's final place, once championship night is decided. */
	placements: Map<string, number> | null
	/** What the next step is waiting for; null once everything is decided. */
	waitingFor: string | null
}

/** Every game in `games` scored, and at least one of them. */
const allScored = (games: readonly StoredGame[]): ScoredGame[] | null => {
	const scored = games.map(scoredGame)
	return scored.length > 0 && scored.every((game) => game !== null)
		? (scored as ScoredGame[])
		: null
}

/**
 * The playoff games and placements the season's results decide.
 *
 * Pool night follows from the regular-season seeds; championship night's
 * first two rounds from the pools; its last two, field by field, from that
 * field's first two games; and the placements from all of it. Each stage
 * reads the games actually stored for the one before, so a result is what
 * was played even if an admin changed a game by hand.
 */
export function planPlayoffs(
	nights: SeasonNights,
	teams: readonly ScheduleTeam[],
	games: readonly StoredGame[]
): PlayoffPlan {
	requireFullLeague(teams)
	const plan: PlayoffPlan = {
		seeds: null,
		games: [],
		placements: null,
		waitingFor: null,
	}

	const regular = allScored(
		games.filter((game) => game.type === GameType.REGULAR)
	)
	if (!regular) {
		plan.waitingFor = 'every regular-season game to have a score'
		return plan
	}
	const seeds = seedTeams(teams, regular)
	plan.seeds = seeds
	plan.games.push(
		...nightOf(
			nights.poolNight,
			POOL_NIGHT,
			(seed) => seeds[seed - 1],
			GameType.PLAYOFF,
			'pool'
		)
	)

	const poolGames = allScored(
		games.filter((game) => game.playoffSlot?.startsWith('pool-'))
	)
	const poolSlots = POOL_NIGHT.flat().length
	if (!poolGames || poolGames.length < poolSlots) {
		plan.waitingFor = 'every pool-night game to have a score'
		return plan
	}
	const bySlot = new Map(
		games
			.filter((game) => game.playoffSlot)
			.map((game) => [game.playoffSlot as string, game])
	)
	const poolOrders = poolsAsPlayed(bySlot)
	if (!poolOrders) {
		plan.waitingFor =
			"pool night's games to form four pools of three again; check them on Game Management"
		return plan
	}
	const placements = new Map<string, number>()
	const waiting: string[] = []
	GAME_CONFIG.ALLOWED_FIELDS.forEach((field, fieldIndex) => {
		CHAMPIONSHIP_POOL_GAMES.forEach(([homePool, awayPool], roundIndex) => {
			plan.games.push({
				date: kickoff(nights.championshipNight, roundIndex),
				field,
				type: GameType.PLAYOFF,
				homeTeamId: poolOrders[homePool][fieldIndex],
				awayTeamId: poolOrders[awayPool][fieldIndex],
				playoffSlot: playoffSlot('championship', roundIndex, fieldIndex),
			})
		})

		/** Who won and lost a championship game on this field, if decided. */
		const outcome = (roundIndex: number): ReturnType<typeof decided> => {
			const stored = bySlot.get(
				playoffSlot('championship', roundIndex, fieldIndex)
			)
			const scored = stored ? scoredGame(stored) : null
			return scored ? decided(scored) : null
		}
		const [first, second] = CHAMPIONSHIP_POOL_GAMES.map((_, roundIndex) =>
			outcome(roundIndex)
		)
		if (!first || !second) {
			waiting.push(
				`both of field ${field}'s first championship games to have a winner`
			)
			return
		}
		const thirdPlaceRound = CHAMPIONSHIP_POOL_GAMES.length
		const finalRound = thirdPlaceRound + 1
		plan.games.push(
			{
				date: kickoff(nights.championshipNight, thirdPlaceRound),
				field,
				type: GameType.PLAYOFF,
				homeTeamId: first.loser,
				awayTeamId: second.loser,
				playoffSlot: playoffSlot('championship', thirdPlaceRound, fieldIndex),
			},
			{
				date: kickoff(nights.championshipNight, finalRound),
				field,
				type: GameType.PLAYOFF,
				homeTeamId: first.winner,
				awayTeamId: second.winner,
				playoffSlot: playoffSlot('championship', finalRound, fieldIndex),
			}
		)

		const final = outcome(finalRound)
		const thirdPlace = outcome(thirdPlaceRound)
		if (!final || !thirdPlace) {
			waiting.push(
				`field ${field}'s last two championship games to have a winner`
			)
			return
		}
		const base = fieldIndex * PLACES_PER_FIELD
		placements.set(final.winner, base + 1)
		placements.set(final.loser, base + 2)
		placements.set(thirdPlace.winner, base + 3)
		placements.set(thirdPlace.loser, base + 4)
	})

	if (waiting.length > 0) {
		plan.waitingFor = waiting.join('; ')
	} else if (placements.size !== teams.length) {
		// Only reachable by changing a championship game's teams by hand.
		plan.waitingFor =
			"championship night's games to place each team once; check them on Game Management"
	} else {
		plan.placements = placements
	}
	return plan
}

/**
 * Each pool's order, first to third, as pool night was actually played:
 * a pool's teams are whoever its three slots hold, in the seed order the
 * layout gives them, so a game re-paired or edited after the seeds were
 * drawn is ranked with the pool it was played in. Null if the stored games
 * no longer make four pools of three different teams.
 */
function poolsAsPlayed(
	bySlot: ReadonlyMap<string, StoredGame>
): string[][] | null {
	const slots = POOL_NIGHT.flatMap((round, roundIndex) =>
		round.map(([homeSeed, awaySeed], fieldIndex) => ({
			homeSeed,
			awaySeed,
			game: bySlot.get(playoffSlot('pool', roundIndex, fieldIndex)),
		}))
	)
	const orders: string[][] = []
	for (const pool of POOLS) {
		const inPool = slots.filter(
			({ homeSeed, awaySeed }) =>
				pool.includes(homeSeed) && pool.includes(awaySeed)
		)
		const members = pool.map((seed) => {
			const slot = inPool.find(
				({ homeSeed, awaySeed }) => homeSeed === seed || awaySeed === seed
			)
			if (!slot?.game) return null
			return slot.homeSeed === seed
				? slot.game.homeTeamId
				: slot.game.awayTeamId
		})
		if (members.some((id) => id === null)) return null
		// Every one of the pool's games must be between its three teams.
		const between = (id: string | null): boolean =>
			id !== null && members.includes(id)
		if (
			!inPool.every(
				({ game }) =>
					between(game?.homeTeamId ?? null) && between(game?.awayTeamId ?? null)
			)
		) {
			return null
		}
		const results = inPool.flatMap(({ game }) => {
			const scored = game ? scoredGame(game) : null
			return scored ? [scored] : []
		})
		orders.push(rankPool(members as string[], results))
	}
	const everyone = orders.flat()
	return new Set(everyone).size === everyone.length ? orders : null
}

/** "pool" for "pool-r1-f2". */
export const stageOf = (slot: string): PlayoffStage =>
	slot.startsWith('pool-') ? 'pool' : 'championship'

/**
 * Whether any game of a playoff night has a score. Its pairing is then
 * fixed: re-pairing the rest from a corrected score would have teams meet
 * twice or play on two fields.
 */
export const stageStarted = (
	games: readonly StoredGame[],
	stage: PlayoffStage
): boolean =>
	games.some(
		(game) =>
			game.playoffSlot !== null &&
			stageOf(game.playoffSlot) === stage &&
			(game.homeScore !== null || game.awayScore !== null)
	)
