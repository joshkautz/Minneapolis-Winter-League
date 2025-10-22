/**
 * News-related Firestore operations
 */

import {
	query,
	collection,
	orderBy,
	where,
	limit,
	startAfter,
	type Query,
	type DocumentSnapshot,
	type DocumentReference,
} from 'firebase/firestore'

import { firestore } from '../app'
import { NewsDocument, SeasonDocument, Collections } from '@/types'

/**
 * Creates a query for news posts in a specific season
 * Ordered by creation date (newest first)
 *
 * @param seasonRef - Reference to the season document
 * @param pageSize - Number of posts to fetch per page (default: 10)
 * @param lastDoc - Last document from previous page for pagination
 */
export const newsQueryBySeason = (
	seasonRef: DocumentReference<SeasonDocument>,
	pageSize: number = 10,
	lastDoc?: DocumentSnapshot<NewsDocument>
): Query<NewsDocument> => {
	const newsCollection = collection(firestore, Collections.NEWS)

	if (lastDoc) {
		return query(
			newsCollection,
			where('season', '==', seasonRef),
			orderBy('createdAt', 'desc'),
			startAfter(lastDoc),
			limit(pageSize)
		) as Query<NewsDocument>
	}

	return query(
		newsCollection,
		where('season', '==', seasonRef),
		orderBy('createdAt', 'desc'),
		limit(pageSize)
	) as Query<NewsDocument>
}

/**
 * Creates a query for all news posts in a specific season
 * Used for admin views
 *
 * @param seasonRef - Reference to the season document
 */
export const allNewsQueryBySeason = (
	seasonRef: DocumentReference<SeasonDocument>
): Query<NewsDocument> => {
	return query(
		collection(firestore, Collections.NEWS),
		where('season', '==', seasonRef),
		orderBy('createdAt', 'desc')
	) as Query<NewsDocument>
}
