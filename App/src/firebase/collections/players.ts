/**
 * Player-related Firestore operations
 */

import {
	doc,
	getDoc,
	query,
	where,
	collection,
	or,
	and,
	type DocumentSnapshot,
	type DocumentReference,
	type Query,
} from 'firebase/firestore'

import { firestore } from '../app'
import { User } from '../auth'
import { PlayerDocument, Collections } from '@/shared/utils'

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
