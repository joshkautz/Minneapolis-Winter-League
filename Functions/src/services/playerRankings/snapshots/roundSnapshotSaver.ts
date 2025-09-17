import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { Collections, RankingHistoryDocument } from '../../../types.js'
import { ALGORITHM_CONSTANTS } from '../constants.js'
import { PlayerRatingState } from '../types.js'
import { createTimeBasedSnapshot } from './snapshotCreator.js'
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
	const seasonRef = firestore
		.collection(Collections.SEASONS)
		.doc(round.seasonId)

	// Create rankings snapshot for this round
	const roundRankings = createTimeBasedSnapshot(playerRatings)

	const snapshotDoc: Partial<RankingHistoryDocument> = {
		season: seasonRef as any,
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
			gameIds: round.games.map((game) => game.id),
			calculationId: calculationId,
		},
	}

	// Use round ID as the document ID for chronological ordering
	// Format: {timestamp}_{seasonId}
	const snapshotId = `${round.roundId}_${round.seasonId}`
	await firestore
		.collection(Collections.RANKINGS_HISTORY)
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
