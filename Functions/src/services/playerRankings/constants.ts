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

	// Rating decay for inactive players (per season of inactivity)
	INACTIVITY_DECAY_PER_SEASON: 0.95,

	// Maximum point differential that gets full weight (adjusted for 20-point games)
	MAX_FULL_WEIGHT_DIFFERENTIAL: 5, // Reduced from 8 - in 20-point games, 5+ margin is significant

	// Minimum team confidence to use team-based strength calculation
	MIN_TEAM_CONFIDENCE: 0.5,

	// Default team strength when confidence is too low
	DEFAULT_TEAM_STRENGTH: 1200,

	// Number of seasons of inactivity before considering a player "retired"
	RETIREMENT_THRESHOLD_SEASONS: 3,
}
