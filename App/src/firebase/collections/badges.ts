/**
 * Badge-related Firestore operations
 */

import {
	query,
	collection,
	orderBy,
	type Query,
	type DocumentReference,
	type CollectionReference,
} from 'firebase/firestore'

import { firestore } from '../app'
import {
	BadgeDocument,
	TeamBadgeDocument,
	TeamDocument,
	Collections,
} from '@/types'

/**
 * Creates a query for all badges
 * Ordered by creation date (newest first)
 */
export const allBadgesQuery = (): Query<BadgeDocument> => {
	return query(
		collection(firestore, Collections.BADGES),
		orderBy('createdAt', 'desc')
	) as Query<BadgeDocument>
}

/**
 * Gets a reference to the badges subcollection for a specific team
 *
 * @param teamRef - Reference to the team document
 */
const getTeamBadgesCollectionRef = (
	teamRef: DocumentReference<TeamDocument> | undefined
): CollectionReference<TeamBadgeDocument> | undefined => {
	if (!teamRef) return undefined
	return collection(
		teamRef,
		Collections.BADGES
	) as CollectionReference<TeamBadgeDocument>
}

/**
 * Creates a query for all badges awarded to a specific team
 * Ordered by awarded date (newest first)
 *
 * @param teamRef - Reference to the team document
 */
export const teamBadgesQuery = (
	teamRef: DocumentReference<TeamDocument> | undefined
): Query<TeamBadgeDocument> | undefined => {
	if (!teamRef) return undefined
	const badgesCollection = getTeamBadgesCollectionRef(teamRef)
	if (!badgesCollection) return undefined

	return query(
		badgesCollection,
		orderBy('awardedAt', 'desc')
	) as Query<TeamBadgeDocument>
}
