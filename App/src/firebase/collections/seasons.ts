/**
 * Season-related Firestore operations
 */

import { query, collection } from 'firebase/firestore'

import { firestore } from '../app'
import { SeasonData, Collections } from '@/shared/utils'
import type { Query, DocumentData } from '../types'

/**
 * Creates a query for all seasons
 */
export const seasonsQuery = (): Query<SeasonData, DocumentData> => {
	return query(collection(firestore, Collections.SEASONS)) as Query<
		SeasonData,
		DocumentData
	>
}
