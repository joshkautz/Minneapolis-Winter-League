/**
 * Turns the engine's round-by-round ratings into what the rebuild saves:
 * the all-time leaderboard, each player's history, and each season's
 * standings. Pure, like the engine, so every rule here is unit-tested.
 */

import { TRUESKILL_CONSTANTS } from '../constants.js'
import { calculateRanksWithTieHandling } from '../utils/rankCalculator.js'
import type {
	EngineResult,
	PlayerRoundRating,
	RoundResult,
} from './rankingEngine.js'

/** One round of a player's history. */
export interface PlayerHistoryPoint {
	roundId: string
	seasonId: string
	date: Date
	rating: number
	/** Rank among every rated player. */
	rank: number
	/**
	 * Rank among the round's season's rostered players, or null when the
	 * player is not on a roster that season.
	 */
	seasonRank: number | null
	/** Rating change since the previous round, the season carry-over included. */
	change: number
	totalGames: number
}

/** A player's place in one season, as of its latest round. */
export interface SeasonStanding {
	playerId: string
	rating: number
	rank: number
	/** Rating change since the season began, after the carry-over into it. */
	ratingChange: number
	games: number
	wins: number
	losses: number
}

export interface FinalRanking {
	playerId: string
	rating: number
	rank: number
	totalGames: number
	totalSeasons: number
	lastSeasonId: string | null
	/** Rating change over the most recent game night. */
	lastRatingChange: number
}

export interface RankingProjections {
	final: FinalRanking[]
	histories: Map<string, PlayerHistoryPoint[]>
	/** Season id → standings, best first. Seasons with no games are absent. */
	seasons: Map<string, SeasonStanding[]>
}

const baseline = TRUESKILL_CONSTANTS.INITIAL_MU

/** Player id → rank, ties sharing a rank, among `among` if given. */
function ranks(
	ratings: Map<string, PlayerRoundRating>,
	among?: ReadonlySet<string>
): Map<string, number> {
	const pool = new Map(
		[...ratings]
			.filter(([id]) => !among || among.has(id))
			.map(([id, rating]) => [id, { id, mu: rating.mu }])
	)
	return new Map(
		calculateRanksWithTieHandling(pool).map(({ player, rank }) => [
			player.id,
			rank,
		])
	)
}

/** The calendar day a round falls on, in the league's time zone. */
const gameNight = (date: Date, timeZone: string): string =>
	new Intl.DateTimeFormat('en-CA', { timeZone }).format(date)

/**
 * @param seasonRosters season id → every player on a roster that season
 * @param timeZone the zone game nights are counted in
 */
export function projectRankings(
	result: EngineResult,
	seasonRosters: ReadonlyMap<string, ReadonlySet<string>>,
	timeZone: string
): RankingProjections {
	const { rounds } = result
	const histories = new Map<string, PlayerHistoryPoint[]>()
	const lastRoundOfSeason = new Map<string, number>()
	const firstRoundOfSeason = new Map<string, number>()

	rounds.forEach((round, index) => {
		if (!firstRoundOfSeason.has(round.seasonId)) {
			firstRoundOfSeason.set(round.seasonId, index)
		}
		lastRoundOfSeason.set(round.seasonId, index)

		const previous = rounds[index - 1]?.ratings
		const allTime = ranks(round.ratings)
		const roster = seasonRosters.get(round.seasonId)
		const inSeason = ranks(round.ratings, roster ?? new Set())

		for (const [playerId, rating] of round.ratings) {
			const history = histories.get(playerId) ?? []
			history.push({
				roundId: round.roundId,
				seasonId: round.seasonId,
				date: round.startTime,
				rating: rating.mu,
				rank: allTime.get(playerId) ?? 0,
				seasonRank: inSeason.get(playerId) ?? null,
				change: rating.mu - (previous?.get(playerId)?.mu ?? baseline),
				totalGames: rating.totalGames,
			})
			histories.set(playerId, history)
		}
	})

	const seasons = new Map<string, SeasonStanding[]>()
	for (const [seasonId, last] of lastRoundOfSeason) {
		const roster = seasonRosters.get(seasonId) ?? new Set<string>()
		const before = rounds[(firstRoundOfSeason.get(seasonId) ?? 0) - 1]
		const records = result.seasonRecords.get(seasonId) ?? new Map()
		const standingRanks = ranks(rounds[last].ratings, roster)
		const standings = [...standingRanks].map(([playerId, rank]) => {
			const rating = rounds[last].ratings.get(playerId)?.mu ?? baseline
			const record = records.get(playerId) ?? { games: 0, wins: 0 }
			return {
				playerId,
				rating,
				rank,
				ratingChange: rating - seasonStartRating(before, playerId),
				games: record.games,
				wins: record.wins,
				losses: record.games - record.wins,
			}
		})
		seasons.set(
			seasonId,
			standings.sort((a, b) => a.rank - b.rank)
		)
	}

	const final = finalRankings(result, rounds, timeZone)
	return { final, histories, seasons }
}

/** What a player started a season at: their carried-over rating, or new. */
function seasonStartRating(
	roundBefore: RoundResult | undefined,
	playerId: string
): number {
	const earlier = roundBefore?.ratings.get(playerId)?.mu
	return earlier === undefined
		? baseline
		: baseline + (earlier - baseline) * TRUESKILL_CONSTANTS.SEASON_CARRY_OVER
}

function finalRankings(
	result: EngineResult,
	rounds: RoundResult[],
	timeZone: string
): FinalRanking[] {
	const last = rounds.at(-1)
	if (!last) return []

	// The rating each player went into the latest game night with, so the
	// change is the same however many times the rebuild runs.
	const night = gameNight(last.startTime, timeZone)
	const firstOfNight = rounds.findIndex(
		(round) => gameNight(round.startTime, timeZone) === night
	)
	const beforeNight = rounds[firstOfNight - 1]?.ratings

	return calculateRanksWithTieHandling(result.players).map(
		({ player, rank }) => ({
			playerId: player.playerId,
			rating: player.mu,
			rank,
			totalGames: player.totalGames,
			totalSeasons: player.totalSeasons,
			lastSeasonId: player.lastSeasonId,
			lastRatingChange:
				player.mu - (beforeNight?.get(player.playerId)?.mu ?? baseline),
		})
	)
}
