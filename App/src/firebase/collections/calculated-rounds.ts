/**
 * Rankings Calculated Rounds related Firestore operations
 */

import { query, collection, orderBy } from 'firebase/firestore'

import { firestore } from '../app'
import { Collections } from '@/types'
import type { Query, DocumentData } from 'firebase/firestore'

/**
 * Document structure for tracking calculated rounds
 */
export interface CalculatedRoundDocument extends DocumentData {
	/** Unique round identifier */
	roundId: string
	/** Timestamp when this round's games started */
	roundStartTime: { toDate: () => Date }
	/** Season ID */
	seasonId: string
	/** Number of games in this round */
	gameCount: number
	/** When this round was calculated */
	calculatedAt: { toDate: () => Date }
	/** ID of the calculation that processed this round */
	calculationId: string
	/** Game IDs that were processed in this round */
	gameIds: string[]
}

/**
 * Creates a query for all calculated rounds
 */
export const calculatedRoundsQuery = (): Query<CalculatedRoundDocument> => {
	return query(
		collection(firestore, Collections.RANKINGS_CALCULATED_ROUNDS),
		orderBy('roundStartTime', 'desc')
	) as Query<CalculatedRoundDocument>
}
