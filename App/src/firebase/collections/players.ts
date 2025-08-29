/**
 * Player-related Firestore operations
 */

import {
	doc,
	getDoc,
	setDoc,
	updateDoc,
	query,
	where,
	collection,
	or,
	and,
} from 'firebase/firestore'

import { firestore } from '../app'
import { User, UserCredential } from '../auth'
import { PlayerDocument, SeasonDocument, TeamDocument, Collections } from '@/shared/utils'
import type {
	DocumentReference,
	DocumentSnapshot,
	QueryDocumentSnapshot,
	Query,
	UpdateData,
	DocumentData,
} from '../types'
import type {
	PlayerSeason,
	TeamRosterPlayer,
} from '@minneapolis-winter-league/shared'

/**
 * Creates a new player document for a registered user
 *
 * @deprecated This function performs client-side validation which can be bypassed.
 * Use `createPlayerViaFunction` from '@/firebase/collections/functions' instead,
 * which performs all validations server-side via Firebase Functions for better security.
 *
 * The Firebase Function ensures:
 * - Server-side authentication verification
 * - Email matches authenticated user
 * - Document ID matches user UID
 * - Admin field is always false
 * - All required fields are validated
 * - Cannot be manipulated client-side
 */
export const createPlayer = (
	res: UserCredential | undefined,
	firstname: string,
	lastname: string,
	email: string,
	season: QueryDocumentSnapshot<SeasonDocument, DocumentData> | undefined
): Promise<void> => {
	console.warn(
		'⚠️  createPlayer is deprecated. Use createPlayerViaFunction for better security.'
	)

	if (!res) {
		return Promise.resolve()
	}
	if (!season) {
		return Promise.resolve()
	}

	return setDoc(doc(firestore, Collections.PLAYERS, res.user.uid), {
		admin: false,
		firstname: firstname,
		lastname: lastname,
		email: email,
		seasons: [
			{
				banned: false, // Add missing field for consistency
				captain: false,
				paid: false,
				season: season.ref,
				signed: false,
				team: null,
			},
		],
	})
}

/**
 * Gets a player document snapshot by reference
 */
export const getPlayerSnapshot = (
	playerRef: DocumentReference<PlayerDocument, DocumentData>
): Promise<DocumentSnapshot<PlayerDocument, DocumentData>> => {
	return getDoc(playerRef)
}

/**
 * Gets a player document reference from authenticated user
 */
export const getPlayerRef = (
	authValue: User | null | undefined
): DocumentReference<PlayerDocument, DocumentData> | undefined => {
	if (!authValue) {
		return undefined
	}
	return doc(
		firestore,
		Collections.PLAYERS,
		authValue.uid
	) as DocumentReference<PlayerDocument, DocumentData>
}

/**
 * Creates a query to search for players by name
 */
export const getPlayersQuery = (
	search: string
): Query<PlayerDocument, DocumentData> | undefined => {
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
		) as Query<PlayerDocument, DocumentData>
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
		) as Query<PlayerDocument, DocumentData>
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
	console.warn(
		'⚠️  updatePlayer is deprecated. Use updatePlayerViaFunction for better security.'
	)
	return updateDoc(doc(firestore, Collections.PLAYERS, authValue!.uid), data)
}

/**
 * Promotes a player to captain status for a specific season and team
 */
export const promoteToCaptain = async (
	playerRef: DocumentReference<PlayerDocument, DocumentData> | undefined,
	teamRef: DocumentReference<TeamDocument, DocumentData> | undefined,
	seasonRef: DocumentReference<SeasonDocument, DocumentData> | undefined
) => {
	if (!playerRef || !teamRef || !seasonRef) {
		return
	}

	// Get the team doc so we can update the team document
	const teamDocumentSnapshot = await getDoc(teamRef)

	// Get the player doc so we can update the player document
	const playerDocumentSnapshot = await getDoc(playerRef)

	return Promise.all([
		// Update the team doc to add captain status for the player
		updateDoc(teamRef, {
			roster: teamDocumentSnapshot
				.data()
				?.roster.map((item: TeamRosterPlayer) => ({
					captain: item.player.id === playerRef.id ? true : item.captain,
					player: item.player,
				})),
		}),
		// Update the player doc to add captain status for the season
		updateDoc(playerRef, {
			seasons: playerDocumentSnapshot
				.data()
				?.seasons.map((item: PlayerSeason) => ({
					captain: item.season.id === seasonRef.id ? true : item.captain,
					paid: item.paid,
					season: item.season,
					signed: item.signed,
					team: item.team,
				})),
		}),
	])
}

/**
 * Demotes a player from captain status for a specific season and team
 */
export const demoteFromCaptain = async (
	playerRef: DocumentReference<PlayerDocument, DocumentData> | undefined,
	teamRef: DocumentReference<TeamDocument, DocumentData> | undefined,
	seasonRef: DocumentReference<SeasonDocument, DocumentData> | undefined
) => {
	if (!playerRef || !teamRef || !seasonRef) {
		return
	}

	// Get the team doc so we can update the team document
	const teamDocumentSnapshot = await getDoc(teamRef)

	// Get the player doc so we can update the player document
	const playerDocumentSnapshot = await getDoc(playerRef)

	// Check if the player is the last captain on the team. Cannot demote last captain.
	if (
		teamDocumentSnapshot
			.data()
			?.roster.filter((item: TeamRosterPlayer) => item.captain).length === 1
	) {
		throw new Error('Cannot demote last captain.')
	}

	return Promise.all([
		// Update the team doc to remove captain status for the player
		updateDoc(teamRef, {
			roster: teamDocumentSnapshot
				.data()
				?.roster.map((item: TeamRosterPlayer) => ({
					captain: item.player.id === playerRef.id ? false : item.captain,
					player: item.player,
				})),
		}),
		// Update the player doc to remove captain status for the season
		updateDoc(playerRef, {
			seasons: playerDocumentSnapshot
				.data()
				?.seasons.map((item: PlayerSeason) => ({
					captain: item.season.id === seasonRef.id ? false : item.captain,
					paid: item.paid,
					season: item.season,
					signed: item.signed,
					team: item.team,
				})),
		}),
	])
}

/**
 * Removes a player from a team
 */
export const removeFromTeam = async (
	playerRef: DocumentReference<PlayerDocument, DocumentData> | undefined,
	teamRef: DocumentReference<TeamDocument, DocumentData> | undefined,
	seasonRef: DocumentReference<SeasonDocument, DocumentData> | undefined
) => {
	if (!playerRef || !teamRef || !seasonRef) {
		return
	}

	await getDoc(teamRef)
		// Ensure this player isn't the last captain on the team
		.then((teamDocumentSnapshot) => {
			if (
				!teamDocumentSnapshot
					.data()
					?.roster.some(
						(item: TeamRosterPlayer) =>
							item.captain && item.player.id !== playerRef.id
					)
			) {
				throw new Error('Cannot remove last captain.')
			}
		})

	// Update the team document to remove the player from the team
	const teamPromise = getDoc(teamRef).then((teamDocumentSnapshot) =>
		updateDoc(teamRef, {
			roster: teamDocumentSnapshot
				.data()
				?.roster.filter(
					(item: TeamRosterPlayer) => item.player.id !== playerRef.id
				),
		})
	)

	// Update the player document to remove the team from their season
	const playerPromise = getDoc(playerRef).then((playerDocumentSnapshot) =>
		updateDoc(playerRef, {
			seasons: playerDocumentSnapshot
				.data()
				?.seasons.map((item: PlayerSeason) => ({
					captain: item.season.id === seasonRef.id ? false : item.team,
					paid: item.paid,
					season: item.season,
					signed: item.signed,
					team: item.season.id === seasonRef.id ? null : item.team,
				})),
		})
	)

	return Promise.all([teamPromise, playerPromise])
}
