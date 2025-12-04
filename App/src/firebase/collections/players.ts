/**
 * Player-related Firestore operations
 */

import {
	doc,
	getDoc,
	updateDoc,
	query,
	where,
	collection,
	or,
	and,
	type DocumentSnapshot,
	type DocumentReference,
	type Query,
	type UpdateData,
} from 'firebase/firestore'

import { firestore } from '../app'
import { User } from '../auth'
import { PlayerDocument, Collections, logger } from '@/shared/utils'

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

/**
 * Updates a player document with new data
 *
 * @deprecated This function performs client-side updates which can be bypassed.
 * Use `updatePlayerViaFunction` from '@/firebase/collections/functions' instead,
 * which performs all validations server-side via Firebase Functions for better security.
 *
 * The Firebase Function ensures:
 * - Server-side authentication verification
 * - Permission checks (users can only update their own profile unless admin)
 * - Field validation and sanitization
 * - Audit logging of all changes
 * - Cannot be manipulated client-side
 */
export const updatePlayer = (
	authValue: User | null | undefined,
	data: UpdateData<PlayerDocument>
): Promise<void> => {
	logger.warn(
		'updatePlayer is deprecated. Use updatePlayerViaFunction for better security.'
	)
	if (!authValue) {
		throw new Error('User must be authenticated to update player')
	}
	return updateDoc(doc(firestore, Collections.PLAYERS, authValue.uid), data)
}
