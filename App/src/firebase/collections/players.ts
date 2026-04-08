/**
 * Player-related Firestore operations
 */

import {
	collection,
	collectionGroup,
	doc,
	getDoc,
	or,
	query,
	and,
	where,
	type CollectionReference,
	type DocumentReference,
	type DocumentSnapshot,
	type Query,
	type QueryDocumentSnapshot,
} from 'firebase/firestore'

import { firestore } from '../app'
import { User } from '../auth'
import {
	Collections,
	PLAYER_SEASONS_SUBCOLLECTION,
	PlayerDocument,
	PlayerSeasonDocument,
	SeasonDocument,
} from '@/shared/utils'

/**
 * Gets a player document snapshot by reference
 */
export const getPlayerSnapshot = (
	playerRef: DocumentReference<PlayerDocument>
): Promise<DocumentSnapshot<PlayerDocument>> => {
	return getDoc(playerRef)
}

/**
 * Gets a player document reference from authenticated user
 */
export const getPlayerRef = (
	authValue: User | null | undefined
): DocumentReference<PlayerDocument> | undefined => {
	if (!authValue) {
		return undefined
	}
	return doc(
		firestore,
		Collections.PLAYERS,
		authValue.uid
	) as DocumentReference<PlayerDocument>
}

// ---- Per-player season subcollection -------------------------------------

/**
 * Get a player's season subdoc reference.
 */
export const playerSeasonRef = (
	playerId: string | undefined,
	seasonId: string | undefined
): DocumentReference<PlayerSeasonDocument> | undefined => {
	if (!playerId || !seasonId) return undefined
	return doc(
		firestore,
		Collections.PLAYERS,
		playerId,
		PLAYER_SEASONS_SUBCOLLECTION,
		seasonId
	) as DocumentReference<PlayerSeasonDocument>
}

/**
 * Get the seasons subcollection ref for a player (i.e. their full
 * participation history).
 */
export const playerSeasonsSubcollection = (
	playerId: string | undefined
): CollectionReference<PlayerSeasonDocument> | undefined => {
	if (!playerId) return undefined
	return collection(
		firestore,
		Collections.PLAYERS,
		playerId,
		PLAYER_SEASONS_SUBCOLLECTION
	) as CollectionReference<PlayerSeasonDocument>
}

/**
 * Query for every player season subdoc for a given season (collection
 * group). Prefer `canonicalPlayerIdFromPlayerSeasonDoc` over reaching
 * into `doc.ref.parent.parent` at call sites.
 */
export const playerSeasonsInSeasonQuery = (
	seasonRef: DocumentReference<SeasonDocument> | undefined
): Query<PlayerSeasonDocument> | undefined => {
	if (!seasonRef) return undefined
	return query(
		collectionGroup(firestore, PLAYER_SEASONS_SUBCOLLECTION),
		where('season', '==', seasonRef)
	) as Query<PlayerSeasonDocument>
}

// ---- Canonical derivation from player season doc snapshots ---------------

/**
 * Derive the canonical player id from a player-season subdoc snapshot.
 * Use this at every collection-group call site instead of reaching into
 * `doc.ref.parent.parent.id`.
 */
export const canonicalPlayerIdFromPlayerSeasonDoc = (
	doc:
		| QueryDocumentSnapshot<PlayerSeasonDocument>
		| DocumentSnapshot<PlayerSeasonDocument>
): string => {
	const playerRef = doc.ref.parent.parent
	if (!playerRef) throw new Error('PlayerSeasonDocument has no parent player')
	return playerRef.id
}

/**
 * Derive the canonical player document reference from a player-season
 * subdoc snapshot. Use this at every collection-group call site instead
 * of reaching into `doc.ref.parent.parent`.
 */
export const canonicalPlayerRefFromPlayerSeasonDoc = (
	doc:
		| QueryDocumentSnapshot<PlayerSeasonDocument>
		| DocumentSnapshot<PlayerSeasonDocument>
): DocumentReference<PlayerDocument> => {
	const playerRef = doc.ref.parent.parent
	if (!playerRef) throw new Error('PlayerSeasonDocument has no parent player')
	return playerRef as DocumentReference<PlayerDocument>
}

/**
 * Creates a query to search for players by name
 */
export const getPlayersQuery = (
	search: string
): Query<PlayerDocument> | undefined => {
	if (search === '') {
		return undefined
	}
	if (search.includes(' ')) {
		const [firstname, lastname] = search.split(' ', 2)
		return query(
			collection(firestore, Collections.PLAYERS),
			where(
				'firstname',
				'>=',
				firstname.charAt(0).toUpperCase() + firstname.slice(1)
			),
			where(
				'firstname',
				'<=',
				firstname.charAt(0).toUpperCase() + firstname.slice(1) + '\uf8ff'
			),
			where(
				'lastname',
				'>=',
				lastname.charAt(0).toUpperCase() + lastname.slice(1)
			),
			where(
				'lastname',
				'<=',
				lastname.charAt(0).toUpperCase() + lastname.slice(1) + '\uf8ff'
			)
		) as Query<PlayerDocument>
	} else {
		return query(
			collection(firestore, Collections.PLAYERS),
			or(
				and(
					where(
						'firstname',
						'>=',
						search.charAt(0).toUpperCase() + search.slice(1)
					),
					where(
						'firstname',
						'<=',
						search.charAt(0).toUpperCase() + search.slice(1) + '\uf8ff'
					)
				),
				and(
					where(
						'lastname',
						'>=',
						search.charAt(0).toUpperCase() + search.slice(1)
					),
					where(
						'lastname',
						'<=',
						search.charAt(0).toUpperCase() + search.slice(1) + '\uf8ff'
					)
				)
			)
		) as Query<PlayerDocument>
	}
}
