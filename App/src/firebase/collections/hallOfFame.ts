/**
 * Hall of Fame related Firestore operations
 */

import { query, where, collection, orderBy, limit, doc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'

import { firestore, functions } from '../app'
import {
    PlayerRankingDocument,
    RankingHistoryDocument,
    RankingCalculationDocument,
    SeasonDocument,
    Collections,
} from '../../types'
import type {
    DocumentReference,
    QueryDocumentSnapshot,
    Query,
} from 'firebase/firestore'

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
 * Creates a query for top N player rankings
 */
export const topPlayerRankingsQuery = (topN: number = 50): Query<PlayerRankingDocument> => {
    return query(
        collection(firestore, Collections.RANKINGS),
        orderBy('rank', 'asc'),
        limit(topN)
    ) as Query<PlayerRankingDocument>
}

/**
 * Creates a query for active player rankings only
 */
export const activePlayerRankingsQuery = (): Query<PlayerRankingDocument> => {
    return query(
        collection(firestore, Collections.RANKINGS),
        where('isActive', '==', true),
        orderBy('rank', 'asc')
    ) as Query<PlayerRankingDocument>
}

/**
 * Creates a query for ranking history for a specific season
 */
export const seasonRankingHistoryQuery = (
    seasonSnapshot: QueryDocumentSnapshot<SeasonDocument> | undefined
): Query<RankingHistoryDocument> | undefined => {
    if (!seasonSnapshot) {
        return undefined
    }

    return query(
        collection(firestore, Collections.RANKING_HISTORY),
        where('season', '==', seasonSnapshot.ref),
        orderBy('week', 'asc')
    ) as Query<RankingHistoryDocument>
}

/**
 * Creates a query for recent ranking history (last N weeks)
 */
export const recentRankingHistoryQuery = (
    weeksBack: number = 10
): Query<RankingHistoryDocument> => {
    return query(
        collection(firestore, Collections.RANKING_HISTORY),
        orderBy('snapshotDate', 'desc'),
        limit(weeksBack)
    ) as Query<RankingHistoryDocument>
}

/**
 * Creates a query for ranking calculations (for monitoring progress)
 */
export const playerRankingCalculationsQuery = (): Query<RankingCalculationDocument> => {
    return query(
        collection(firestore, Collections.RANKING_CALCULATIONS),
        orderBy('startedAt', 'desc'),
        limit(20)
    ) as Query<RankingCalculationDocument>
}

/**
 * Calls the Firebase Function to trigger Hall of Fame calculation
 */
export const triggerHallOfFameCalculation = httpsCallable<
    {
        calculationType: 'full' | 'incremental'
        applyDecay?: boolean
        startSeasonId?: string
        startWeek?: number
    },
    {
        calculationId: string
        status: string
        message: string
    }
>(functions, 'calculateHallOfFameRankings')

/**
 * Calls the Firebase Function to get calculation status
 */
export const getHallOfFameCalculationStatus = httpsCallable<
    { calculationId: string },
    RankingCalculationDocument
>(functions, 'getCalculationStatus')

/**
 * Gets a specific player ranking by player ID
 */
export const getPlayerRankingById = (
    playerId: string
): DocumentReference<PlayerRankingDocument> => {
    return doc(firestore, Collections.RANKINGS, playerId) as DocumentReference<PlayerRankingDocument>
}

/**
 * Creates a query for a player's ranking history across seasons
 */
export const playerRankingHistoryQuery = (): Query<RankingHistoryDocument> => {
    return query(
        collection(firestore, Collections.RANKING_HISTORY),
        orderBy('snapshotDate', 'asc')
        // Note: We'll need to filter client-side for specific player
        // since Firestore doesn't support array-contains with orderBy
    ) as Query<RankingHistoryDocument>
}
