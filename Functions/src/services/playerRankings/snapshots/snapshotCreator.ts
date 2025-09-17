import { TimeBasedPlayerRanking } from '../../../types.js'
import { PlayerRatingState } from '../types.js'

/**
 * Converts player ratings to time-based snapshot format
 */
export function createTimeBasedSnapshot(
	playerRatings: Map<string, PlayerRatingState>
): TimeBasedPlayerRanking[] {
	const rankings = Array.from(playerRatings.values())
		.sort((a, b) => b.currentRating - a.currentRating)
		.map((playerState, index) => {
			return {
				playerId: playerState.playerId,
				playerName: playerState.playerName,
				eloRating: playerState.currentRating,
				rank: index + 1,
				totalGames: playerState.totalGames,
				totalSeasons: playerState.totalSeasons,
			}
		})

	return rankings
}
