/**
 * Posts Firestore operations
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
import {
	PostDocument,
	ReplyDocument,
	SeasonDocument,
	Collections,
} from '@/types'

/**
 * Creates a query for posts in a specific season
 * Ordered by creation date (newest first)
 *
 * @param seasonRef - Reference to the season document
 * @param pageSize - Number of posts to fetch per page (default: 10)
 * @param lastDoc - Last document from previous page for pagination
 */
export const postsQueryBySeason = (
	seasonRef: DocumentReference<SeasonDocument>,
	pageSize: number = 10,
	lastDoc?: DocumentSnapshot<PostDocument>
): Query<PostDocument> => {
	const postsCollection = collection(firestore, Collections.POSTS)

	if (lastDoc) {
		return query(
			postsCollection,
			where('season', '==', seasonRef),
			orderBy('createdAt', 'desc'),
			startAfter(lastDoc),
			limit(pageSize)
		) as Query<PostDocument>
	}

	return query(
		postsCollection,
		where('season', '==', seasonRef),
		orderBy('createdAt', 'desc'),
		limit(pageSize)
	) as Query<PostDocument>
}

/**
 * Creates a query for all posts in a specific season
 * Used for admin views
 *
 * @param seasonRef - Reference to the season document
 */
export const allPostsQueryBySeason = (
	seasonRef: DocumentReference<SeasonDocument>
): Query<PostDocument> => {
	return query(
		collection(firestore, Collections.POSTS),
		where('season', '==', seasonRef),
		orderBy('createdAt', 'desc')
	) as Query<PostDocument>
}

/**
 * Creates a query for replies on a specific post
 * Ordered by creation date (oldest first for conversation flow)
 *
 * @param postId - The post document ID
 */
export const repliesQuery = (postId: string): Query<ReplyDocument> => {
	return query(
		collection(firestore, Collections.POSTS, postId, 'replies'),
		orderBy('createdAt', 'asc')
	) as Query<ReplyDocument>
}
