/**
 * Season-related Firestore operations
 */

import { query, collection, orderBy } from 'firebase/firestore'

import { firestore } from '../app'
import { SeasonDocument, Collections } from '@/shared/utils'
import type { Query, DocumentData } from '../types'

/**
 * Creates a query for all seasons
 */
export const seasonsQuery = (): Query<SeasonDocument, DocumentData> => {
	return query(
		collection(firestore, Collections.SEASONS) as any, 
		orderBy('dateStart', 'desc')
	) as Query<SeasonDocument, DocumentData>
}
