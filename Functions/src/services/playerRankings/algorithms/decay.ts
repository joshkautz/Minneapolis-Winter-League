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
		} else {
			// Player is not playing in this round, increment inactivity
			playerState.roundsSinceLastGame++
		}

		// Apply universal gravity well - ALL players drift toward 1200 over time
		// This happens regardless of whether they played this round
		// Philosophy: Ratings represent current skill, which naturally regresses to mean
		const currentRating = playerState.currentRating
		const baseRating = ALGORITHM_CONSTANTS.STARTING_RATING
		const ratingAboveBase = currentRating - baseRating
		const isActive = playersInCurrentRound.has(playerId)

		// Asymmetric gravity: participation is always beneficial
		// - Above 1200: active players decay slower (benefit from playing)
		// - Below 1200: active players recover faster (benefit from playing)
		let decayFactor
		if (currentRating >= baseRating) {
			// Player is above average (1200+)
			if (isActive) {
				// Active players decay slowly toward 1200
				decayFactor = ALGORITHM_CONSTANTS.GRAVITY_WELL_PER_ROUND
			} else {
				// Inactive players decay faster toward 1200
				decayFactor = ALGORITHM_CONSTANTS.INACTIVITY_DECAY_PER_ROUND
			}
		} else {
			// Player is below average (sub-1200)
			if (isActive) {
				// Active players drift faster toward 1200 (reward participation)
				decayFactor = ALGORITHM_CONSTANTS.INACTIVITY_DECAY_PER_ROUND
			} else {
				// Inactive players drift slower toward 1200 (penalty for absence)
				decayFactor = ALGORITHM_CONSTANTS.GRAVITY_WELL_PER_ROUND
			}
		}

		// Apply decay toward 1200 baseline (works for both above and below 1200)
		playerState.currentRating = baseRating + ratingAboveBase * decayFactor
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
