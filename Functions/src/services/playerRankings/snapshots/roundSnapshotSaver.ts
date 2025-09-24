import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import {
	Collections,
	RankingHistoryDocument,
	SeasonDocument,
} from '../../../types.js'
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
		season: seasonRef as FirebaseFirestore.DocumentReference<SeasonDocument>,
		snapshotDate: Timestamp.fromDate(round.startTime),
		rankings: roundRankings,
		calculationMeta: {
			totalGamesProcessed: round.games.length,
			avgRating: calculateAverageRating(playerRatings),
			activePlayerCount: playerRatings.size,
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
 * Calculates average rating of all players
 */
function calculateAverageRating(
	playerRatings: Map<string, PlayerRatingState>
): number {
	const allRatings = Array.from(playerRatings.values()).map(
		(p) => p.currentRating
	)

	return allRatings.length > 0
		? allRatings.reduce((sum, rating) => sum + rating, 0) / allRatings.length
		: ALGORITHM_CONSTANTS.STARTING_RATING
}
