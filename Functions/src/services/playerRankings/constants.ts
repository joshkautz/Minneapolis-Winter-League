/**
 * TrueSkill Rating Algorithm Constants
 *
 * Based on Microsoft's TrueSkill Bayesian skill rating system.
 * Reference: https://trueskill.org/
 */

/**
 * Precision multiplier for rating comparison
 * Used to avoid floating point comparison issues when checking for ties
 */
export const RATING_PRECISION_MULTIPLIER = 1000000

export const TRUESKILL_CONSTANTS = {
	// Initial skill estimate for new players (μ)
	INITIAL_MU: 25.0,

	// Initial uncertainty for new players (σ)
	// Standard TrueSkill uses μ/3 = 8.333
	INITIAL_SIGMA: 25.0 / 3.0,

	// Performance variance (β)
	// Represents the variance in a player's performance from game to game
	// Standard TrueSkill uses σ/2 = 4.167
	BETA: 25.0 / 6.0,

	// Dynamics factor (τ)
	// Small amount of uncertainty added each game to allow for skill changes over time
	// Standard TrueSkill uses σ/100 = 0.0833
	TAU: 25.0 / 3.0 / 100.0, // INITIAL_SIGMA / 100

	// Draw probability epsilon
	// Controls the probability of a draw (set low since draws are rare in Ultimate)
	DRAW_PROBABILITY_EPSILON: 0.001,

	// Minimum sigma (prevents sigma from going to zero)
	MIN_SIGMA: 0.01,

	// Playoff game multiplier (2x impact for playoff games)
	PLAYOFF_MULTIPLIER: 2.0,

	// Exponential decay factor per season
	// Each older season's games are weighted by this factor
	// 0.8 means: current season = 100%, previous = 80%, before that = 64%, etc.
	SEASON_DECAY_FACTOR: 0.8,

	// Gravity well - all ratings drift toward INITIAL_MU over time
	// Applied per round to both μ and σ
	// 0.998 means ratings lose 0.2% of their distance from INITIAL_MU each round
	GRAVITY_WELL_PER_ROUND: 0.998,

	// Additional decay for inactive players (stacks with gravity well)
	// Inactive players drift faster toward the baseline
	INACTIVITY_DECAY_PER_ROUND: 0.992,

	// Sigma increase for inactive players (uncertainty grows when not playing)
	// Applied per round of inactivity
	SIGMA_INCREASE_PER_INACTIVE_ROUND: 1.002,

	// Maximum sigma (caps uncertainty growth)
	MAX_SIGMA: 25.0 / 3.0, // Can't exceed initial uncertainty
}
