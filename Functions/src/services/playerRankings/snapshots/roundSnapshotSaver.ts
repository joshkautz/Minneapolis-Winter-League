import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import {
	Collections,
	RankingHistoryDocument,
	SeasonDocument,
} from '../../../types.js'
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

	// Create rankings snapshot for this round, passing previous ratings for change tracking
	const roundRankings = createTimeBasedSnapshot(playerRatings, previousRatings)

	const snapshotDoc: Partial<RankingHistoryDocument> = {
		season: seasonRef as FirebaseFirestore.DocumentReference<SeasonDocument>,
		snapshotDate: Timestamp.fromDate(round.startTime),
		rankings: roundRankings,
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
