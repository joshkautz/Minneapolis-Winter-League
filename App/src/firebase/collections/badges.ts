/**
 * Badge-related Firestore operations
 */

import {
	query,
	collection,
	collectionGroup,
	orderBy,
	where,
	doc,
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
 * Gets a reference to a specific badge document
 *
 * @param badgeId - The badge ID
 */
export const getBadgeRef = (
	badgeId: string | undefined
): DocumentReference<BadgeDocument> | undefined => {
	if (!badgeId) return undefined
	return doc(
		firestore,
		Collections.BADGES,
		badgeId
	) as DocumentReference<BadgeDocument>
}

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
export const getTeamBadgesCollectionRef = (
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

/**
 * Gets a reference to a specific team badge document
 *
 * @param teamRef - Reference to the team document
 * @param badgeId - The badge ID
 */
export const getTeamBadgeRef = (
	teamRef: DocumentReference<TeamDocument> | undefined,
	badgeId: string | undefined
): DocumentReference<TeamBadgeDocument> | undefined => {
	if (!teamRef || !badgeId) return undefined
	return doc(
		teamRef,
		Collections.BADGES,
		badgeId
	) as DocumentReference<TeamBadgeDocument>
}

/**
 * Creates a query for all teams that have been awarded a specific badge
 * Uses collectionGroup to query across all team badge subcollections
 *
 * @param badgeRef - Reference to the badge document
 */
export const teamsWithBadgeQuery = (
	badgeRef: DocumentReference<BadgeDocument> | undefined
): Query<TeamBadgeDocument> | undefined => {
	if (!badgeRef) return undefined
	return query(
		collectionGroup(firestore, Collections.BADGES),
		where('badge', '==', badgeRef)
	) as Query<TeamBadgeDocument>
}
