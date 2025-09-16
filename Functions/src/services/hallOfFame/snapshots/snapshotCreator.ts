import { WeeklyPlayerRanking } from '../../../types.js'
import { PlayerRatingState, WeeklyStats } from '../types.js'

/**
 * Converts player ratings to weekly snapshot format
 */
export function createWeeklySnapshot(
	playerRatings: Map<string, PlayerRatingState>,
	previousRatings?: Map<string, number>,
	weeklyStats?: Map<string, WeeklyStats>
): WeeklyPlayerRanking[] {
	const rankings = Array.from(playerRatings.values())
		.sort((a, b) => b.currentRating - a.currentRating)
		.map((playerState, index) => {
			const previousRating =
				previousRatings?.get(playerState.playerId) || playerState.currentRating
			const weeklyChange = playerState.currentRating - previousRating
			const playerWeeklyStats = weeklyStats?.get(playerState.playerId) || {
				gamesPlayed: 0,
				pointDifferential: 0,
			}

			return {
				playerId: playerState.playerId,
				playerName: playerState.playerName,
				eloRating: playerState.currentRating,
				rank: index + 1,
				weeklyChange: weeklyChange,
				gamesThisWeek: playerWeeklyStats.gamesPlayed,
				pointDifferentialThisWeek: playerWeeklyStats.pointDifferential,
				totalGames: playerState.totalGames,
				totalSeasons: playerState.seasonStats.size,
				seasonStats: Array.from(playerState.seasonStats.values()),
			}
		})

	return rankings
}
