import { ALGORITHM_CONSTANTS } from '../constants.js'

/**
 * Calculates a weighted point differential with diminishing returns
 * Optimized for 40-minute Ultimate Frisbee games (~20 total points)
 *
 * Typical scoring patterns:
 * - Close games: 11-9, 10-10 (1-2 point margins)
 * - Solid wins: 12-8, 13-7 (4-5 point margins)
 * - Dominant wins: 15-5, 14-6 (8-10 point margins)
 */
export function calculateWeightedPointDifferential(
	rawDifferential: number
): number {
	const absValue = Math.abs(rawDifferential)
	const sign = Math.sign(rawDifferential)

	if (absValue <= ALGORITHM_CONSTANTS.MAX_FULL_WEIGHT_DIFFERENTIAL) {
		return rawDifferential
	}

	// Apply logarithmic scaling for large differentials
	// Conservative scaling since large margins are rarer in 20-point games
	const scaledValue =
		ALGORITHM_CONSTANTS.MAX_FULL_WEIGHT_DIFFERENTIAL +
		Math.log(absValue - ALGORITHM_CONSTANTS.MAX_FULL_WEIGHT_DIFFERENTIAL + 1) *
			2.2 // Reduced from 2.5 - more conservative for lower-scoring games

	return sign * scaledValue
}
