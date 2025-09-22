import { TimeBasedPlayerRanking } from '../../../types.js'
import { PlayerRatingState } from '../types.js'

/**
 * Converts player ratings to time-based snapshot format with proper tie handling
 */
export function createTimeBasedSnapshot(
	playerRatings: Map<string, PlayerRatingState>
): TimeBasedPlayerRanking[] {
	const sortedPlayers = Array.from(playerRatings.values()).sort(
		(a, b) => b.currentRating - a.currentRating
	)

	const rankings: TimeBasedPlayerRanking[] = []
	let currentRank = 1

	for (let i = 0; i < sortedPlayers.length; i++) {
		const player = sortedPlayers[i]

		// Check if this player is tied with the previous player
		if (i > 0) {
			const previousPlayer = sortedPlayers[i - 1]
			// Round to 6 decimal places for comparison (matching frontend precision)
			const currentRating = Math.round(player.currentRating * 1000000) / 1000000
			const previousRating =
				Math.round(previousPlayer.currentRating * 1000000) / 1000000

			// If ratings are different, advance the rank by the number of players at the previous rating level
			if (currentRating !== previousRating) {
				// Count how many players had the previous rating
				let playersAtPreviousRank = 1
				for (let j = i - 2; j >= 0; j--) {
					const comparisonRating =
						Math.round(sortedPlayers[j].currentRating * 1000000) / 1000000
					if (comparisonRating === previousRating) {
						playersAtPreviousRank++
					} else {
						break
					}
				}
				currentRank += playersAtPreviousRank
			}
		}

		rankings.push({
			playerId: player.playerId,
			playerName: player.playerName,
			eloRating: player.currentRating,
			rank: currentRank,
			totalGames: player.totalGames,
			totalSeasons: player.totalSeasons,
		})
	}

	return rankings
}
