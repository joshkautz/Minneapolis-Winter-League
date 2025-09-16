import { PlayerSeasonStats, WeeklyPlayerRanking } from '../../../types.js'
import { PlayerRatingState } from '../types.js'

/**
 * Converts a ranking snapshot back to player rating states
 */
export function convertSnapshotToRatings(
	rankings: WeeklyPlayerRanking[]
): Map<string, PlayerRatingState> {
	const playerRatings = new Map<string, PlayerRatingState>()

	for (const ranking of rankings) {
		// Reconstruct season stats map from the array
		const seasonStatsMap = new Map<string, PlayerSeasonStats>()
		if (ranking.seasonStats) {
			for (const seasonStat of ranking.seasonStats) {
				seasonStatsMap.set(seasonStat.seasonId, seasonStat)
			}
		}

		playerRatings.set(ranking.playerId, {
			playerId: ranking.playerId,
			playerName: ranking.playerName,
			currentRating: ranking.eloRating,
			totalGames: ranking.totalGames || 0, // Preserve existing total
			seasonStats: seasonStatsMap,
			lastSeasonId: null, // Will be updated as games are processed
			isActive: true,
		})
	}

	return playerRatings
}
