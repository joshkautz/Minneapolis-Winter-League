/**
 * Shared by the leaderboard and a player's page, for all-time and
 * per-season rankings alike.
 */

import {
	GameType,
	RATING_PRECISION_MULTIPLIER,
	type GameDocument,
	type PlayerRankingRound,
} from '@/types'
import { getTeamRole } from '@/shared/utils'

/** A row the leaderboard ranks: its rating decides its place. */
export interface RankableRow {
	id: string
	playerName: string
	rating: number
}

export interface RankedRow<Row extends RankableRow> {
	row: Row
	/** Shared by every player on the same rating, as in a sports table. */
	rank: number
	/** Whether the rank earns a medal: first to third, ties included. */
	medal: boolean
}

/**
 * Orders rows by rating, highest first, giving players on the same rating
 * (to the precision the rankings store) the same rank and listing them by
 * name. The next rank after a tie skips the places it took: 1, 1, 1, 4.
 */
export function rankWithTies<Row extends RankableRow>(
	rows: Row[]
): RankedRow<Row>[] {
	const byRating = new Map<number, Row[]>()
	for (const row of rows) {
		const rating =
			Math.round(row.rating * RATING_PRECISION_MULTIPLIER) /
			RATING_PRECISION_MULTIPLIER
		const group = byRating.get(rating)
		if (group) group.push(row)
		else byRating.set(rating, [row])
	}

	const ranked: RankedRow<Row>[] = []
	for (const rating of [...byRating.keys()].sort((a, b) => b - a)) {
		const group = (byRating.get(rating) ?? []).sort((a, b) =>
			a.playerName.localeCompare(b.playerName)
		)
		const rank = ranked.length + 1
		for (const row of group) ranked.push({ row, rank, medal: rank <= 3 })
	}
	return ranked
}

/** How a player's team did in one game. */
export interface GameResult {
	opponent: string
	teamScore: number
	opponentScore: number
	outcome: 'win' | 'loss' | 'tie'
	playoff: boolean
}

/** One time slot of a season, as it went for the player. */
export interface SeasonSlot {
	round: PlayerRankingRound
	/** The game the player's team played in this slot; null if it sat out. */
	game: GameResult | null
}

/** The result for `teamId` of a game it played, or null if it did not. */
export function gameResultFor(
	game: GameDocument,
	teamId: string
): GameResult | null {
	const role = getTeamRole(game, teamId)
	if (!role || game.homeScore === null || game.awayScore === null) return null
	const teamScore = role === 'home' ? game.homeScore : game.awayScore
	const opponentScore = role === 'home' ? game.awayScore : game.homeScore
	return {
		opponent: (role === 'home' ? game.awayName : game.homeName) ?? 'Unknown',
		teamScore,
		opponentScore,
		outcome:
			teamScore > opponentScore
				? 'win'
				: teamScore < opponentScore
					? 'loss'
					: 'tie',
		playoff: game.type === GameType.PLAYOFF,
	}
}

/**
 * A season's rounds for one player, each with the game their team played
 * in it. A round is one time slot, and the rankings group games by their
 * start time, so a round and its game share the same kickoff.
 */
export function seasonSlots(
	rounds: PlayerRankingRound[],
	seasonId: string,
	games: GameDocument[],
	teamId: string | null
): SeasonSlot[] {
	const gamesByKickoff = new Map<number, GameResult>()
	if (teamId) {
		for (const game of games) {
			if (game.season?.id !== seasonId) continue
			const result = gameResultFor(game, teamId)
			if (result) gamesByKickoff.set(game.date.toMillis(), result)
		}
	}
	return rounds
		.filter((round) => round.seasonId === seasonId)
		.map((round) => ({
			round,
			game: gamesByKickoff.get(round.date.toMillis()) ?? null,
		}))
}

/**
 * The seasons a player was on a roster for, in the order they played them.
 * A player is rated every round once they have played, so their history
 * also runs through seasons they sat out; those rounds have no season rank.
 */
export const seasonIdsOf = (rounds: PlayerRankingRound[]): string[] => [
	...new Set(
		rounds
			.filter((round) => round.seasonRank !== null)
			.map((round) => round.seasonId)
	),
]
