/**
 * Team-related Firestore operations
 */

import {
	doc,
	query,
	where,
	collection,
	documentId,
	type DocumentReference,
	type QueryDocumentSnapshot,
	type Query,
} from 'firebase/firestore'

import { firestore } from '../app'
import { SeasonDocument, TeamDocument, Collections } from '@/shared/utils'

/**
 * Gets a team document reference by ID
 */
export const getTeamById = (
	id: string | undefined
): DocumentReference<TeamDocument> | undefined => {
	if (!id) {
		return
	}

	return doc(
		firestore,
		Collections.TEAMS,
		id
	) as DocumentReference<TeamDocument>
}

/**
 * Creates a query for multiple teams by their references
 */
export const teamsQuery = (
	teams: (DocumentReference<TeamDocument> | null)[] | undefined
): Query<TeamDocument> | undefined => {
	if (!teams || !teams.length) {
		return
	}

	return query(
		collection(firestore, Collections.TEAMS),
		where(documentId(), 'in', teams)
	) as Query<TeamDocument>
}

/**
 * Creates a query for teams with the same team ID (for history tracking)
 */
export const teamsHistoryQuery = (
	id: string | undefined
): Query<TeamDocument> | undefined => {
	if (!id) {
		return undefined
	}

	return query(
		collection(firestore, Collections.TEAMS),
		where('teamId', '==', id)
	) as Query<TeamDocument>
}

/**
 * Creates a query for all teams in a specific season
 */
export const currentSeasonTeamsQuery = (
	seasonSnapshot: QueryDocumentSnapshot<SeasonDocument> | undefined
): Query<TeamDocument> | undefined => {
	if (!seasonSnapshot) {
		return undefined
	}

	return query(
		collection(firestore, Collections.TEAMS),
		where('season', '==', seasonSnapshot.ref)
	) as Query<TeamDocument>
}

/**
 * Creates a query for teams by season reference
 */
export const teamsBySeasonQuery = (
	seasonRef: DocumentReference<SeasonDocument> | undefined
): Query<TeamDocument> | undefined => {
	if (!seasonRef) {
		return
	}
	return query(
		collection(firestore, Collections.TEAMS),
		where('season', '==', seasonRef)
	) as Query<TeamDocument>
}

/**
 * Creates a query for all teams
 */
export const allTeamsQuery = (): Query<TeamDocument> => {
	return collection(firestore, Collections.TEAMS) as Query<TeamDocument>
}
