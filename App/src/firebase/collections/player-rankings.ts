/**
 * Player Rankings related Firestore operations
 */

import {
	query,
	collection,
	orderBy,
	limit,
	type Query,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'

import { firestore, functions } from '../app'
import {
	PlayerRankingDocument,
	RankingsCalculationDocument,
	Collections,
} from '../../types'

/**
 * Creates a query for current player rankings
 */
export const currentPlayerRankingsQuery = (): Query<PlayerRankingDocument> => {
	return query(
		collection(firestore, Collections.RANKINGS),
		orderBy('rank', 'asc')
	) as Query<PlayerRankingDocument>
}

/**
 * Creates a query for rankings calculations (for monitoring progress)
 */
export const playerRankingsCalculationsQuery =
	(): Query<RankingsCalculationDocument> => {
		return query(
			collection(firestore, Collections.RANKINGS_CALCULATIONS),
			orderBy('startedAt', 'desc'),
			limit(20)
		) as Query<RankingsCalculationDocument>
	}

/**
 * Calls the Firebase Function to completely rebuild Player Rankings from scratch
 * Processes all games grouped by rounds in chronological order
 *
 * Use this for initial setup or complete recalculation of all rankings
 */
export const rebuildPlayerRankings = httpsCallable<
	{}, // No parameters needed - decay is always applied
	{
		calculationId: string
		status: string
		message: string
	}
>(functions, 'rebuildPlayerRankings')

/**
 * Calls the Firebase Function to incrementally update Player Rankings
 * Processes only uncalculated rounds for efficient updates
 *
 * Use this for regular production updates when adding new games
 */
export const updatePlayerRankings = httpsCallable<
	{}, // No parameters needed - decay is always applied
	{
		calculationId: string
		status: string
		message: string
	}
>(functions, 'updatePlayerRankings')
