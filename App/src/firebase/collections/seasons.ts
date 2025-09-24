/**
 * Season-related Firestore operations
 */

import { query, collection, orderBy } from 'firebase/firestore'

import { firestore } from '../app'
import { SeasonDocument, Collections } from '@/shared/utils'
import type { Query } from 'firebase/firestore'

/**
 * Creates a query for all seasons
 */
export const seasonsQuery = (): Query<SeasonDocument> => {
	return query(
		collection(firestore, Collections.SEASONS) as any,
		orderBy('dateStart', 'desc')
	) as Query<SeasonDocument>
}
