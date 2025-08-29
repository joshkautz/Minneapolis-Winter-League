/**
 * Game-related Firestore operations
 */

import { query, where, collection, orderBy, or } from 'firebase/firestore'

import { firestore } from '../app'
import {
	GameDocument,
	SeasonDocument,
	TeamDocument,
	Collections,
} from '@/shared/utils'
import type { DocumentReference } from '@/firebase/adapter'
import type { QueryDocumentSnapshot, Query } from 'firebase/firestore'

/**
 * Creates a query for regular season games in a specific season
 */
export const currentSeasonRegularGamesQuery = (
	seasonSnapshot: QueryDocumentSnapshot<SeasonDocument> | undefined
): Query<GameDocument> | undefined => {
	if (!seasonSnapshot) {
		return undefined
	}

	return query(
		collection(firestore, Collections.GAMES),
		where('season', '==', seasonSnapshot.ref),
		where('type', '==', 'regular')
	) as Query<GameDocument>
}

/**
 * Creates a query for playoff games in a specific season
 */
export const currentSeasonPlayoffGamesQuery = (
	seasonSnapshot: QueryDocumentSnapshot<SeasonDocument> | undefined
): Query<GameDocument> | undefined => {
	if (!seasonSnapshot) {
		return undefined
	}

	return query(
		collection(firestore, Collections.GAMES),
		where('season', '==', seasonSnapshot.ref),
		where('type', '==', 'playoff')
	) as Query<GameDocument>
}

/**
 * Creates a query for all games in a specific season
 */
export const currentSeasonGamesQuery = (
	seasonSnapshot: QueryDocumentSnapshot<SeasonDocument> | undefined
): Query<GameDocument> | undefined => {
	if (!seasonSnapshot) {
		return undefined
	}

	return query(
		collection(firestore, Collections.GAMES),
		where('season', '==', seasonSnapshot.ref)
	) as Query<GameDocument>
}

/**
 * Creates a query for all games involving a specific team
 */
export const gamesByTeamQuery = (
	teamRef: DocumentReference<TeamDocument> | undefined
): Query<GameDocument> | undefined => {
	if (!teamRef) {
		return
	}
	return query(
		collection(firestore, Collections.GAMES),
		or(where('home', '==', teamRef), where('away', '==', teamRef)),
		orderBy('date', 'asc')
	) as Query<GameDocument>
}
