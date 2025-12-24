import { TRUESKILL_CONSTANTS } from '../constants.js'
import { PlayerRatingState } from '../types.js'

/**
 * Applies gradual rating decay for players using TrueSkill
 *
 * This implements two mechanisms:
 * 1. Gravity well - all ratings drift toward INITIAL_MU over time
 * 2. Inactivity penalty - inactive players drift faster and gain uncertainty
 *
 * This function should be called for each round to apply incremental decay.
 */
export function applyRoundBasedDecay(
	playerRatings: Map<string, PlayerRatingState>,
	currentRoundDate: Date,
	playersInCurrentRound: Set<string>
): void {
	const baseMu = TRUESKILL_CONSTANTS.INITIAL_MU

	for (const [playerId, playerState] of playerRatings) {
		const isActive = playersInCurrentRound.has(playerId)

		// If player is playing in this round, reset their inactivity counter
		if (isActive) {
			playerState.lastGameDate = currentRoundDate
			playerState.roundsSinceLastGame = 0
		} else {
			// Player is not playing in this round, increment inactivity
			playerState.roundsSinceLastGame++
		}

		// Calculate distance from baseline
		const muAboveBase = playerState.mu - baseMu

		// Determine decay factor based on activity and rating position
		let decayFactor: number

		if (playerState.mu >= baseMu) {
			// Player is above average
			if (isActive) {
				// Active players decay slowly toward baseline
				decayFactor = TRUESKILL_CONSTANTS.GRAVITY_WELL_PER_ROUND
			} else {
				// Inactive players decay faster toward baseline
				decayFactor = TRUESKILL_CONSTANTS.INACTIVITY_DECAY_PER_ROUND
			}
		} else {
			// Player is below average
			if (isActive) {
				// Active players recover faster toward baseline (reward participation)
				decayFactor = TRUESKILL_CONSTANTS.INACTIVITY_DECAY_PER_ROUND
			} else {
				// Inactive players recover slower toward baseline (penalty for absence)
				decayFactor = TRUESKILL_CONSTANTS.GRAVITY_WELL_PER_ROUND
			}
		}

		// Apply decay to mu (drift toward baseline)
		playerState.mu = baseMu + muAboveBase * decayFactor

		// Handle sigma (uncertainty)
		if (isActive) {
			// Active players: sigma stays the same (already updated by TrueSkill)
			// No additional change needed
		} else {
			// Inactive players: uncertainty grows slightly
			playerState.sigma = Math.min(
				playerState.sigma *
					TRUESKILL_CONSTANTS.SIGMA_INCREASE_PER_INACTIVE_ROUND,
				TRUESKILL_CONSTANTS.MAX_SIGMA
			)
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
