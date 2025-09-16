import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { Collections, RankingHistoryDocument } from '../../../types.js'
import { ALGORITHM_CONSTANTS } from '../constants.js'
import { GameProcessingData, PlayerRatingState } from '../types.js'
import { createWeeklySnapshot } from './snapshotCreator.js'
import { GameRound } from '../gameProcessing/roundGrouper.js'

/**
 * Saves a ranking snapshot after each round of games
 */
export async function saveRoundSnapshot(
	round: GameRound,
	playerRatings: Map<string, PlayerRatingState>,
	previousRatings: Map<string, number>,
	calculationId: string
): Promise<void> {
	const firestore = getFirestore()
	const seasonRef = firestore.collection(Collections.SEASONS).doc(round.seasonId)

	// Create rankings snapshot for this round
	const roundRankings = createRoundSnapshot(playerRatings, previousRatings, round.games)

	const snapshotDoc: Partial<RankingHistoryDocument> = {
		season: seasonRef as any,
		week: round.week,
		snapshotDate: Timestamp.fromDate(round.startTime),
		rankings: roundRankings,
		calculationMeta: {
			totalGamesProcessed: round.games.length,
			avgRating: calculateAverageRating(playerRatings),
			activePlayerCount: Array.from(playerRatings.values()).filter(
				(p) => p.isActive
			).length,
			calculatedAt: Timestamp.now(),
		},
		// Add round-specific metadata
		roundMeta: {
			roundId: round.roundId,
			roundStartTime: Timestamp.fromDate(round.startTime),
			gameCount: round.games.length,
			gameIds: round.games.map(game => game.id),
			calculationId: calculationId
		}
	}

	// Use round ID as the document ID for chronological ordering
	// Format: {timestamp}_{seasonId}_week_{week}
	const snapshotId = `${round.roundId}_${round.seasonId}_week_${round.week}`
	await firestore
		.collection(Collections.RANKINGS_HISTORY)
		.doc(snapshotId)
		.set(snapshotDoc)
}

/**
 * Creates a ranking snapshot for a specific round
 */
function createRoundSnapshot(
	playerRatings: Map<string, PlayerRatingState>,
	previousRatings: Map<string, number>,
	roundGames: GameProcessingData[]
): any[] {
	// Convert player ratings to a sorted array
	const sortedRatings = Array.from(playerRatings.entries())
		.map(([playerId, playerState]) => ({
			playerId,
			playerName: playerState.playerName,
			currentRating: playerState.currentRating,
			previousRating: previousRatings.get(playerId) || ALGORITHM_CONSTANTS.STARTING_RATING,
			totalGames: playerState.totalGames,
			isActive: playerState.isActive,
		}))
		.sort((a, b) => b.currentRating - a.currentRating) // Sort by rating descending

	// Add rank positions and calculate changes
	return sortedRatings.map((player, index) => ({
		...player,
		rank: index + 1,
		change: player.currentRating - player.previousRating,
		gamesPlayedInRound: roundGames.length > 0 ? 1 : 0, // Simplified: assume active players played 1 game per round
	}))
}

/**
 * Calculates average rating of all active players
 */
function calculateAverageRating(
	playerRatings: Map<string, PlayerRatingState>
): number {
	const activeRatings = Array.from(playerRatings.values())
		.filter((p) => p.isActive)
		.map((p) => p.currentRating)

	return activeRatings.length > 0
		? activeRatings.reduce((sum, rating) => sum + rating, 0) /
				activeRatings.length
		: ALGORITHM_CONSTANTS.STARTING_RATING
}

/**
 * Legacy function - saves a weekly ranking snapshot
 * Kept for backward compatibility but now also called after each round
 */
export async function saveWeeklySnapshot(
	seasonId: string,
	week: number,
	playerRatings: Map<string, PlayerRatingState>,
	weeklyGames: GameProcessingData[],
	previousRatings: Map<string, number>,
	incrementalStartSeasonIndex?: number,
	incrementalStartWeek?: number,
	totalSeasons?: number
): Promise<void> {
	const firestore = getFirestore()
	const seasonRef = firestore.collection(Collections.SEASONS).doc(seasonId)

	// Calculate weekly stats by processing the games
	const weeklyStats = await calculateWeeklyStatsLocal(
		weeklyGames,
		incrementalStartSeasonIndex,
		incrementalStartWeek,
		totalSeasons
	)

	// Calculate previous ratings (using the passed previousRatings from start of week)
	const weeklyRankings = createWeeklySnapshot(
		playerRatings,
		previousRatings,
		weeklyStats
	)

	const snapshotDoc: Partial<RankingHistoryDocument> = {
		season: seasonRef as any,
		week,
		snapshotDate: Timestamp.now(),
		rankings: weeklyRankings,
		calculationMeta: {
			totalGamesProcessed: weeklyGames.length,
			avgRating: calculateAverageRating(playerRatings),
			activePlayerCount: Array.from(playerRatings.values()).filter(
				(p) => p.isActive
			).length,
			calculatedAt: Timestamp.now(),
		},
	}

	// Use composite ID for easy querying - keep existing format for backward compatibility
	const snapshotId = `${seasonId}_week_${week}`
	await firestore
		.collection(Collections.RANKINGS_HISTORY)
		.doc(snapshotId)
		.set(snapshotDoc)
}

// Import the existing calculateWeeklyStats function for backward compatibility
async function calculateWeeklyStatsLocal(
	weeklyGames: GameProcessingData[],
	incrementalStartSeasonIndex?: number,
	incrementalStartWeek?: number,
	totalSeasons?: number
): Promise<Map<string, any>> {
	// This is a simplified version - in the real implementation, 
	// this would import from the existing statsCalculator
	return new Map()
}