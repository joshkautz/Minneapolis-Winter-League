/**
 * Player Rankings related Firestore operations
 */

import {
	query,
	collection,
	doc,
	orderBy,
	limit,
	type DocumentReference,
	type Query,
} from 'firebase/firestore'

import { firestore } from '../app'
import {
	Collections,
	SEASON_RANKINGS_SUBCOLLECTION,
	type PlayerRankingDocument,
	type PlayerRankingHistoryDocument,
	type RankingsCalculationDocument,
	type SeasonRankingDocument,
} from '@/types'

/**
 * Creates a query for current player rankings
 */
export const currentPlayerRankingsQuery = (): Query<PlayerRankingDocument> => {
	return query(
		collection(firestore, Collections.RANKINGS),
		orderBy('rank', 'asc')
	) as Query<PlayerRankingDocument>
}

/** One season's standings: its rostered players, by rank. */
export const seasonRankingsQuery = (
	seasonId: string
): Query<SeasonRankingDocument> =>
	query(
		collection(
			firestore,
			Collections.SEASONS,
			seasonId,
			SEASON_RANKINGS_SUBCOLLECTION
		),
		orderBy('rank', 'asc')
	) as Query<SeasonRankingDocument>

/** A player's standing in one season. */
export const seasonRankingRef = (
	seasonId: string,
	playerId: string
): DocumentReference<SeasonRankingDocument> =>
	doc(
		firestore,
		Collections.SEASONS,
		seasonId,
		SEASON_RANKINGS_SUBCOLLECTION,
		playerId
	) as DocumentReference<SeasonRankingDocument>

/** A player's rating and ranks after every round they have been rated. */
export const playerRankingHistoryRef = (
	playerId: string
): DocumentReference<PlayerRankingHistoryDocument> =>
	doc(
		firestore,
		Collections.PLAYER_RANKING_HISTORY,
		playerId
	) as DocumentReference<PlayerRankingHistoryDocument>

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
