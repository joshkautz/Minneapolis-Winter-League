/**
 * Season-related Firestore operations
 */

import {
	collection,
	doc,
	orderBy,
	query,
	type DocumentReference,
	type Query,
} from 'firebase/firestore'

import { firestore } from '../app'
import { SeasonDocument, Collections } from '@/shared/utils'

/**
 * Creates a query for all seasons
 */
export const seasonsQuery = (): Query<SeasonDocument> => {
	return query(
		collection(firestore, Collections.SEASONS),
		orderBy('dateStart', 'desc')
	) as Query<SeasonDocument>
}

/** A season document by id. */
export const seasonRefById = (
	seasonId: string
): DocumentReference<SeasonDocument> =>
	doc(
		firestore,
		Collections.SEASONS,
		seasonId
	) as DocumentReference<SeasonDocument>
