import { TimeBasedPlayerRanking } from '../../../types.js'
import { PlayerRatingState } from '../types.js'
import { calculateRanksWithTieHandling } from '../utils/rankCalculator.js'

/**
 * Converts player ratings to time-based snapshot format with proper tie handling
 * Uses TrueSkill mu (skill estimate) for ranking
 *
 * @param playerRatings - Current player ratings
 * @param previousRatings - Optional map of player IDs to previous mu values for calculating changes
 */
export function createTimeBasedSnapshot(
	playerRatings: Map<string, PlayerRatingState>,
	previousRatings?: Map<string, number>
): TimeBasedPlayerRanking[] {
	const rankedPlayers = calculateRanksWithTieHandling(playerRatings)

	return rankedPlayers.map(({ player, rank }) => {
		// Calculate change from previous rating if available
		const prevRating = previousRatings?.get(player.playerId)
		const change = prevRating !== undefined ? player.mu - prevRating : undefined

		return {
			playerId: player.playerId,
			playerName: player.playerName,
			rating: player.mu, // TrueSkill μ (skill estimate)
			rank,
			totalGames: player.totalGames,
			totalSeasons: player.totalSeasons,
			change,
			previousRating: prevRating,
		}
	})
}
