import { ALGORITHM_CONSTANTS } from '../constants.js'
import { PlayerRatingState } from '../types.js'

/**
 * Applies gradual rating decay for players who haven't played in recent rounds
 * This function should be called for each round to apply incremental decay
 */
export function applyRoundBasedDecay(
	playerRatings: Map<string, PlayerRatingState>,
	currentRoundDate: Date,
	playersInCurrentRound: Set<string>
): void {
	for (const [playerId, playerState] of playerRatings) {
		// If player is playing in this round, reset their inactivity counter
		if (playersInCurrentRound.has(playerId)) {
			playerState.lastGameDate = currentRoundDate
			playerState.roundsSinceLastGame = 0
			playerState.isActive = true
		} else {
			// Player is not playing in this round, increment inactivity and apply decay
			playerState.roundsSinceLastGame++

			// Apply gradual decay if player has been inactive
			if (playerState.roundsSinceLastGame > 0) {
				const decayFactor = ALGORITHM_CONSTANTS.INACTIVITY_DECAY_PER_ROUND
				const ratingAboveBase =
					playerState.currentRating - ALGORITHM_CONSTANTS.STARTING_RATING
				playerState.currentRating =
					ALGORITHM_CONSTANTS.STARTING_RATING + ratingAboveBase * decayFactor
			}

			// Mark as inactive if they haven't played in many rounds
			if (
				playerState.roundsSinceLastGame >=
				ALGORITHM_CONSTANTS.RETIREMENT_THRESHOLD_ROUNDS
			) {
				playerState.isActive = false
			}
		}
	}
}

/**
 * Initialize round tracking for players when they first play
 * This should be called when a player is first added to the ratings system
 */
export function initializePlayerRoundTracking(
	playerState: PlayerRatingState,
	gameDate: Date
): void {
	playerState.lastGameDate = gameDate
	playerState.roundsSinceLastGame = 0
}
