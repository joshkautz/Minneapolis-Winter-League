import { TimeBasedPlayerRanking } from '../../../types.js'
import { PlayerRatingState } from '../types.js'

/**
 * Converts a ranking snapshot back to player rating states
 */
export function convertSnapshotToRatings(
	rankings: TimeBasedPlayerRanking[]
): Map<string, PlayerRatingState> {
	const playerRatings = new Map<string, PlayerRatingState>()

	for (const ranking of rankings) {
		playerRatings.set(ranking.playerId, {
			playerId: ranking.playerId,
			playerName: ranking.playerName,
			currentRating: ranking.eloRating,
			totalGames: ranking.totalGames || 0, // Preserve existing total
			totalSeasons: ranking.totalSeasons || 0,
			seasonsPlayed: new Set(), // Will be rebuilt as games are processed
			lastSeasonId: null, // Will be updated as games are processed
			isActive: true,
		})
	}

	return playerRatings
}
