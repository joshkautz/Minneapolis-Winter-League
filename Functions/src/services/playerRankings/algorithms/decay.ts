import { ALGORITHM_CONSTANTS } from '../constants.js'
import { PlayerRatingState } from '../types.js'

/**
 * Applies rating decay for players who haven't played in recent seasons
 */
export function applyInactivityDecay(
	playerRatings: Map<string, PlayerRatingState>,
	currentSeasonId: string,
	allSeasonIds: string[]
): void {
	const currentSeasonIndex = allSeasonIds.indexOf(currentSeasonId)

	for (const [, playerState] of playerRatings) {
		if (!playerState.lastSeasonId) {
			continue
		}

		const lastSeasonIndex = allSeasonIds.indexOf(playerState.lastSeasonId)
		const seasonsInactive = currentSeasonIndex - lastSeasonIndex

		if (seasonsInactive > 0) {
			const decayFactor = Math.pow(
				ALGORITHM_CONSTANTS.INACTIVITY_DECAY_PER_SEASON,
				seasonsInactive
			)
			const ratingAboveBase =
				playerState.currentRating - ALGORITHM_CONSTANTS.STARTING_RATING
			playerState.currentRating =
				ALGORITHM_CONSTANTS.STARTING_RATING + ratingAboveBase * decayFactor

			// Mark as inactive if they haven't played in several seasons
			if (seasonsInactive >= ALGORITHM_CONSTANTS.RETIREMENT_THRESHOLD_SEASONS) {
				playerState.isActive = false
			}
		}
	}
}
