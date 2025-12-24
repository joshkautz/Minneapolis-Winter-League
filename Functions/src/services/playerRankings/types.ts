import { GameDocument } from '../../types.js'

export interface GameProcessingData extends GameDocument {
	id: string
	seasonOrder: number // 0 = most recent season, 1 = previous, etc.
	gameDate: Date
}

/**
 * Player rating state using TrueSkill algorithm
 *
 * Each player's skill is represented by a Gaussian distribution N(μ, σ²)
 * - mu: The estimated skill level (higher = better)
 * - sigma: The uncertainty in the skill estimate (lower = more confident)
 */
export interface PlayerRatingState {
	playerId: string
	playerName: string
	// TrueSkill rating components
	mu: number // Estimated skill (mean of Gaussian)
	sigma: number // Uncertainty (standard deviation of Gaussian)
	// Tracking fields
	totalGames: number
	totalSeasons: number
	seasonsPlayed: Set<string> // Track which seasons player has participated in
	lastSeasonId: string | null
	lastGameDate: Date | null // Track when player last played a game
	roundsSinceLastGame: number // Track rounds of inactivity
}
