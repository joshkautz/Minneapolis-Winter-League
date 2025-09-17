/**
 * Player Rankings Rating Algorithm Constants
 * Optimized for 40-minute Ultimate Frisbee games (~20 total points per game)
 */
export const ALGORITHM_CONSTANTS = {
	// Starting Elo rating for new players
	STARTING_RATING: 1200,

	// K-factor for Elo calculation (moderate increase - 20-point games have good signal but not overwhelming)
	K_FACTOR: 36, // Reduced from 48 - lower scoring means more variance per point

	// Playoff game multiplier
	PLAYOFF_MULTIPLIER: 1.8, // Increased from 1.5 - low scoring = higher variance in elimination games

	// Exponential decay factor per season (each season back is multiplied by this)
	SEASON_DECAY_FACTOR: 0.82, // Reduced from 0.85 - lower scoring means less clear skill signal

	// Rating decay for inactive players (per round of inactivity within a season)
	INACTIVITY_DECAY_PER_ROUND: 0.996, // Very small decay per round, accumulates over time

	// Maximum rounds of inactivity before applying full seasonal decay
	MAX_ROUNDS_FOR_SEASONAL_DECAY: 20, // Typical season has ~12-16 rounds

	// Equivalent seasonal decay rate (what a full season of inactivity should achieve)
	EQUIVALENT_SEASONAL_DECAY: 0.95, // Same as old INACTIVITY_DECAY_PER_SEASON

	// Maximum point differential that gets full weight (adjusted for 20-point games)
	MAX_FULL_WEIGHT_DIFFERENTIAL: 5, // Reduced from 8 - in 20-point games, 5+ margin is significant

	// Minimum team confidence to use team-based strength calculation
	MIN_TEAM_CONFIDENCE: 0.5,

	// Default team strength when confidence is too low
	DEFAULT_TEAM_STRENGTH: 1200,

	// Number of rounds of inactivity before considering a player "retired" within current season
	RETIREMENT_THRESHOLD_ROUNDS: 40, // About 2-3 seasons worth of rounds
}
