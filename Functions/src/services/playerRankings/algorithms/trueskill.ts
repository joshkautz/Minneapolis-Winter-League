/**
 * TrueSkill Rating Algorithm Implementation
 *
 * Based on Microsoft's TrueSkill Bayesian skill rating system.
 * Designed for team-based games where individual player skills are inferred from team outcomes.
 *
 * Key concepts:
 * - Each player has a skill represented by a Gaussian distribution N(μ, σ²)
 * - μ (mu) = estimated skill level
 * - σ (sigma) = uncertainty about the skill estimate
 * - Team skill = sum of individual player skills
 *
 * Reference: https://trueskill.org/
 */

import { TRUESKILL_CONSTANTS } from '../constants.js'

/**
 * Gaussian distribution helper functions
 */

/** Cumulative distribution function for standard normal distribution */
export function normCdf(x: number): number {
	// Approximation using error function
	const a1 = 0.254829592
	const a2 = -0.284496736
	const a3 = 1.421413741
	const a4 = -1.453152027
	const a5 = 1.061405429
	const p = 0.3275911

	const sign = x < 0 ? -1 : 1
	const absX = Math.abs(x) / Math.sqrt(2)

	const t = 1.0 / (1.0 + p * absX)
	const y =
		1.0 -
		((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX)

	return 0.5 * (1.0 + sign * y)
}

/** Probability density function for standard normal distribution */
export function normPdf(x: number): number {
	return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
}

/**
 * V function (truncated Gaussian expectation)
 * Used when the outcome is a win (team performance > opponent performance)
 */
export function vWin(t: number, epsilon: number): number {
	const denom = normCdf(t - epsilon)
	if (denom < 1e-10) return -t + epsilon
	return normPdf(t - epsilon) / denom
}

/**
 * W function (truncated Gaussian variance correction)
 * Used when the outcome is a win
 */
export function wWin(t: number, epsilon: number): number {
	const denom = normCdf(t - epsilon)
	if (denom < 1e-10) return 1
	const v = vWin(t, epsilon)
	return v * (v + t - epsilon)
}

/**
 * Represents a player's skill as a Gaussian distribution
 */
export interface TrueSkillRating {
	mu: number // Mean (estimated skill)
	sigma: number // Standard deviation (uncertainty)
}

/**
 * Calculates the total skill of a team (sum of player skills)
 */
export function calculateTeamMu(ratings: TrueSkillRating[]): number {
	return ratings.reduce((sum, r) => sum + r.mu, 0)
}

/**
 * Calculates the combined uncertainty of a team
 * σ_team² = Σ(σ_i²) + n * β²
 * where β² is the performance variance
 */
export function calculateTeamSigma(ratings: TrueSkillRating[]): number {
	const sumSigmaSquared = ratings.reduce((sum, r) => sum + r.sigma * r.sigma, 0)
	const betaSquared =
		TRUESKILL_CONSTANTS.BETA * TRUESKILL_CONSTANTS.BETA * ratings.length
	return Math.sqrt(sumSigmaSquared + betaSquared)
}

/**
 * The main TrueSkill update function for a two-team match
 *
 * @param winningTeam - Array of ratings for the winning team
 * @param losingTeam - Array of ratings for the losing team
 * @param multiplier - Optional multiplier for playoff games (default 1.0)
 * @returns Updated ratings for both teams
 */
export function updateRatings(
	winningTeam: TrueSkillRating[],
	losingTeam: TrueSkillRating[],
	multiplier: number = 1.0
): { winners: TrueSkillRating[]; losers: TrueSkillRating[] } {
	// Calculate team statistics
	const winnerMu = calculateTeamMu(winningTeam)
	const loserMu = calculateTeamMu(losingTeam)
	const winnerSigma = calculateTeamSigma(winningTeam)
	const loserSigma = calculateTeamSigma(losingTeam)

	// Total variance including dynamics factor
	const totalSigma = Math.sqrt(
		winnerSigma * winnerSigma +
			loserSigma * loserSigma +
			2 * TRUESKILL_CONSTANTS.TAU * TRUESKILL_CONSTANTS.TAU
	)

	// Performance difference (normalized)
	const deltaMu = winnerMu - loserMu
	const t = deltaMu / totalSigma

	// Epsilon controls margin for upset detection
	const epsilon = TRUESKILL_CONSTANTS.DRAW_PROBABILITY_EPSILON / totalSigma

	// Calculate v and w for win outcome
	const v = vWin(t, epsilon)
	const w = wWin(t, epsilon)

	// Apply multiplier to the update magnitude (for playoffs)
	const scaledV = v * multiplier

	// Update each player's rating
	// Winners: mu increases (positive v), sigma decreases (more confidence)
	const updatedWinners = winningTeam.map((rating) => {
		const sigmaSquared = rating.sigma * rating.sigma
		const muMultiplier = sigmaSquared / (totalSigma * totalSigma)
		const sigmaMultiplier = sigmaSquared / (totalSigma * totalSigma)

		const newMu = rating.mu + muMultiplier * scaledV * totalSigma
		const newSigmaSquared = sigmaSquared * (1 - w * sigmaMultiplier)
		// Sigma always decreases during updates; floor at MIN_SIGMA
		const newSigma = Math.max(
			Math.sqrt(newSigmaSquared),
			TRUESKILL_CONSTANTS.MIN_SIGMA
		)

		return { mu: newMu, sigma: newSigma }
	})

	// Losers: mu decreases (negative v), sigma decreases (more confidence)
	const updatedLosers = losingTeam.map((rating) => {
		const sigmaSquared = rating.sigma * rating.sigma
		const muMultiplier = sigmaSquared / (totalSigma * totalSigma)
		const sigmaMultiplier = sigmaSquared / (totalSigma * totalSigma)

		const newMu = rating.mu + muMultiplier * -scaledV * totalSigma
		const newSigmaSquared = sigmaSquared * (1 - w * sigmaMultiplier)
		// Sigma always decreases during updates; floor at MIN_SIGMA
		const newSigma = Math.max(
			Math.sqrt(newSigmaSquared),
			TRUESKILL_CONSTANTS.MIN_SIGMA
		)

		return { mu: newMu, sigma: newSigma }
	})

	return { winners: updatedWinners, losers: updatedLosers }
}
