/**
 * The rankings calculation itself, free of Firestore: games, rosters and
 * names in, every player's rating after every round out.
 *
 * Keeping it pure is what lets the same code run in the rebuild, in unit
 * tests, and against a copy of production data when comparing algorithm
 * changes.
 */

import { TRUESKILL_CONSTANTS } from '../constants.js'
import { updateRatings, type TrueSkillRating } from '../algorithms/trueskill.js'
import { applyRoundBasedDecay } from '../algorithms/decay.js'
import type { PlayerRatingState } from '../types.js'

export interface EngineSeason {
	id: string
	dateStart: Date
}

export interface EngineGame {
	id: string
	seasonId: string
	date: Date
	type: 'regular' | 'playoff'
	homeTeamId: string | null
	awayTeamId: string | null
	homeScore: number | null
	awayScore: number | null
}

export interface EngineInput {
	seasons: EngineSeason[]
	games: EngineGame[]
	/** Player ids on each team's roster, keyed by `rosterKey`. */
	rosters: ReadonlyMap<string, readonly string[]>
	/** Display names; a rostered player without one is left out. */
	playerNames: ReadonlyMap<string, string>
}

/**
 * How older seasons count for less.
 *
 * - `lookback` (v5): each game's movement is scaled by 0.8 per season
 *   between its season and the newest one, counted when the rebuild runs,
 *   so every past rating shifts whenever a season is added.
 * - `boundary` (v6): at the first round of each season every rating moves
 *   toward the baseline, keeping `seasonCarryOver` of its distance from it,
 *   so older seasons count for less going forward. Each round is computed
 *   as it was at the time and never shifts later.
 */
export type SeasonWeighting =
	{ kind: 'lookback' } | { kind: 'boundary'; seasonCarryOver: number }

export interface PlayerRoundRating {
	mu: number
	sigma: number
	totalGames: number
	totalSeasons: number
}

export interface RoundResult {
	/** The round's start time in milliseconds, as a string. */
	roundId: string
	seasonId: string
	startTime: Date
	gameIds: string[]
	/** Every rated player's state after the round. */
	ratings: Map<string, PlayerRoundRating>
	/** Each rated player's μ before the round. */
	previousMu: Map<string, number>
}

export interface EngineResult {
	rounds: RoundResult[]
	players: Map<string, PlayerRatingState>
}

export const rosterKey = (teamId: string, seasonId: string): string =>
	`${teamId}/${seasonId}`

const isCompleted = (game: EngineGame): boolean =>
	game.homeTeamId !== null &&
	game.awayTeamId !== null &&
	game.homeScore !== null &&
	game.awayScore !== null

/** Games that start at the same moment, in start order. */
function groupIntoRounds(games: EngineGame[]): EngineGame[][] {
	const rounds = new Map<number, EngineGame[]>()
	for (const game of games) {
		const start = game.date.getTime()
		const round = rounds.get(start)
		if (round) round.push(game)
		else rounds.set(start, [game])
	}
	return [...rounds.entries()]
		.sort(([a], [b]) => a - b)
		.map(([, round]) => round)
}

const newPlayerState = (
	playerId: string,
	playerName: string,
	firstGame: Date
): PlayerRatingState => ({
	playerId,
	playerName,
	mu: TRUESKILL_CONSTANTS.INITIAL_MU,
	sigma: TRUESKILL_CONSTANTS.INITIAL_SIGMA,
	totalGames: 0,
	totalSeasons: 0,
	seasonsPlayed: new Set(),
	lastSeasonId: null,
	lastGameDate: firstGame,
	roundsSinceLastGame: 0,
})

/** Moves every rating part of the way back to the baseline. */
function carryOverToNewSeason(
	players: Map<string, PlayerRatingState>,
	seasonCarryOver: number
): void {
	const baseline = TRUESKILL_CONSTANTS.INITIAL_MU
	for (const player of players.values()) {
		player.mu = baseline + (player.mu - baseline) * seasonCarryOver
	}
}

/**
 * Plays every completed game, round by round in start order, and returns
 * each player's rating after every round.
 */
export function runRankings(
	input: EngineInput,
	weighting: SeasonWeighting
): EngineResult {
	const seasons = [...input.seasons].sort(
		(a, b) => a.dateStart.getTime() - b.dateStart.getTime()
	)
	// 0 for the newest season, 1 for the one before, and so on.
	const seasonsAgo = new Map(
		seasons.map((season, i) => [season.id, seasons.length - 1 - i])
	)

	const games = input.games
		.filter(isCompleted)
		.sort((a, b) => a.date.getTime() - b.date.getTime())

	const players = new Map<string, PlayerRatingState>()
	const rounds: RoundResult[] = []
	let previousSeasonId: string | null = null

	const rosterOf = (teamId: string | null, seasonId: string): string[] =>
		teamId ? [...(input.rosters.get(rosterKey(teamId, seasonId)) ?? [])] : []

	for (const roundGames of groupIntoRounds(games)) {
		const startTime = roundGames[0].date
		const seasonId = roundGames[0].seasonId

		if (
			weighting.kind === 'boundary' &&
			previousSeasonId !== null &&
			seasonId !== previousSeasonId
		) {
			carryOverToNewSeason(players, weighting.seasonCarryOver)
		}
		previousSeasonId = seasonId

		const previousMu = new Map(
			[...players].map(([id, player]) => [id, player.mu])
		)

		const playing = new Set(
			roundGames.flatMap((game) => [
				...rosterOf(game.homeTeamId, game.seasonId),
				...rosterOf(game.awayTeamId, game.seasonId),
			])
		)
		applyRoundBasedDecay(players, startTime, playing)

		for (const game of roundGames) {
			playGame(game, players, input, rosterOf, weighting, seasonsAgo)
		}

		rounds.push({
			roundId: startTime.getTime().toString(),
			seasonId,
			startTime,
			gameIds: roundGames.map((game) => game.id),
			ratings: new Map(
				[...players].map(([id, player]) => [
					id,
					{
						mu: player.mu,
						sigma: player.sigma,
						totalGames: player.totalGames,
						totalSeasons: player.totalSeasons,
					},
				])
			),
			previousMu,
		})
	}

	return { rounds, players }
}

function playGame(
	game: EngineGame,
	players: Map<string, PlayerRatingState>,
	input: EngineInput,
	rosterOf: (teamId: string | null, seasonId: string) => string[],
	weighting: SeasonWeighting,
	seasonsAgo: Map<string, number>
): void {
	const homeRoster = rosterOf(game.homeTeamId, game.seasonId)
	const awayRoster = rosterOf(game.awayTeamId, game.seasonId)
	if (homeRoster.length === 0 || awayRoster.length === 0) return

	const statesFor = (roster: string[]): PlayerRatingState[] =>
		roster.flatMap((playerId) => {
			const existing = players.get(playerId)
			if (existing) return [existing]
			const name = input.playerNames.get(playerId)
			if (name === undefined) return []
			const created = newPlayerState(playerId, name, game.date)
			players.set(playerId, created)
			return [created]
		})
	const home = statesFor(homeRoster)
	const away = statesFor(awayRoster)

	// Draws do not happen in this league; a tie counts as an away win.
	const homeWon = (game.homeScore ?? 0) > (game.awayScore ?? 0)
	const winners = homeWon ? home : away
	const losers = homeWon ? away : home

	const playoff =
		game.type === 'playoff' ? TRUESKILL_CONSTANTS.PLAYOFF_MULTIPLIER : 1
	const lookback =
		weighting.kind === 'lookback'
			? TRUESKILL_CONSTANTS.SEASON_DECAY_FACTOR **
				(seasonsAgo.get(game.seasonId) ?? 0)
			: 1

	const toRating = (player: PlayerRatingState): TrueSkillRating => ({
		mu: player.mu,
		sigma: player.sigma,
	})
	const updated = updateRatings(
		winners.map(toRating),
		losers.map(toRating),
		playoff * lookback
	)
	winners.forEach((player, i) => Object.assign(player, updated.winners[i]))
	losers.forEach((player, i) => Object.assign(player, updated.losers[i]))

	for (const player of [...home, ...away]) {
		player.totalGames++
		player.lastSeasonId = game.seasonId
		player.seasonsPlayed.add(game.seasonId)
		player.totalSeasons = player.seasonsPlayed.size
	}
}
