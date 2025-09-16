import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { Collections, RankingHistoryDocument } from '../../../types.js'
import { ALGORITHM_CONSTANTS } from '../constants.js'
import { GameProcessingData, PlayerRatingState } from '../types.js'
import { createWeeklySnapshot } from './snapshotCreator.js'
import { calculateWeeklyStats } from './statsCalculator.js'

/**
 * Saves a weekly ranking snapshot
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
	const weeklyStats = await calculateWeeklyStats(
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

	// Use composite ID for easy querying
	const snapshotId = `${seasonId}_week_${week}`
	await firestore
		.collection(Collections.RANKING_HISTORY)
		.doc(snapshotId)
		.set(snapshotDoc)
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
