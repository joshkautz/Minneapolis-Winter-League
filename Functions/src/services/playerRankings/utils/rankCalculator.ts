/**
 * Shared ranking calculation utility with proper tie handling
 *
 * This module extracts the common ranking logic used by both:
 * - snapshotCreator.ts (for round-based snapshots)
 * - rankingsSaver.ts (for final rankings)
 */

import { PlayerRatingState } from '../types.js'
import { RATING_PRECISION_MULTIPLIER } from '../constants.js'

/**
 * Represents a player with their calculated rank
 */
export interface RankedPlayer {
	player: PlayerRatingState
	rank: number
}

/**
 * Calculates player rankings with proper tie handling
 * Uses TrueSkill mu (skill estimate) for ranking, sorted descending (higher is better)
 *
 * Tie handling: Players with the same mu (rounded to precision) share the same rank.
 * The next rank skips by the number of tied players (e.g., 1, 1, 3, 4, 4, 4, 7)
 *
 * @param playerRatings - Map of player ratings to rank
 * @returns Array of players with their calculated ranks, sorted by rank (ascending)
 */
export function calculateRanksWithTieHandling(
	playerRatings: Map<string, PlayerRatingState>
): RankedPlayer[] {
	// Sort by mu (TrueSkill skill estimate) - higher is better
	const sortedPlayers = Array.from(playerRatings.values()).sort(
		(a, b) => b.mu - a.mu
	)

	const rankedPlayers: RankedPlayer[] = []
	let currentRank = 1

	for (let i = 0; i < sortedPlayers.length; i++) {
		const player = sortedPlayers[i]

		// Check if this player is tied with the previous player
		if (i > 0) {
			const previousPlayer = sortedPlayers[i - 1]
			// Round to precision for comparison (matching frontend precision)
			const currentMu =
				Math.round(player.mu * RATING_PRECISION_MULTIPLIER) /
				RATING_PRECISION_MULTIPLIER
			const previousMu =
				Math.round(previousPlayer.mu * RATING_PRECISION_MULTIPLIER) /
				RATING_PRECISION_MULTIPLIER

			// If ratings are different, advance the rank by the number of players at the previous rating level
			if (currentMu !== previousMu) {
				// Count how many players had the previous rating
				let playersAtPreviousRank = 1
				for (let j = i - 2; j >= 0; j--) {
					const comparisonMu =
						Math.round(sortedPlayers[j].mu * RATING_PRECISION_MULTIPLIER) /
						RATING_PRECISION_MULTIPLIER
					if (comparisonMu === previousMu) {
						playersAtPreviousRank++
					} else {
						break
					}
				}
				currentRank += playersAtPreviousRank
			}
		}

		rankedPlayers.push({ player, rank: currentRank })
	}

	return rankedPlayers
}
