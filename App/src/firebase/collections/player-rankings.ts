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
 * Processes all games grouped by rounds in chronological order using TrueSkill algorithm.
 *
 * Note: Incremental updates were deprecated because TrueSkill requires accurate
 * sigma (uncertainty) tracking across all games for proper rating calculations.
 * Full rebuilds ensure correct sigma values are maintained.
 */
export const rebuildPlayerRankings = httpsCallable<
	Record<string, never>, // No parameters needed - decay is always applied
	{
		calculationId: string
		status: string
		message: string
	}
>(functions, 'rebuildPlayerRankings')
