/**
 * Team-related Firestore operations
 */

import {
	addDoc,
	deleteDoc,
	doc,
	query,
	where,
	getDoc,
	updateDoc,
	getDocs,
	collection,
	documentId,
	Timestamp,
} from 'firebase/firestore'
import { v4 as uuidv4 } from 'uuid'

import { firestore } from '../app'
import { deleteImage, ref, storage } from '../storage'
import {
	PlayerDocument,
	SeasonDocument,
	TeamDocument,
	OfferDocument,
	Collections,
	DocumentData,
	PlayerSeason,
	TeamRosterPlayer,
} from '@/shared/utils'
import type {
	DocumentReference,
	QueryDocumentSnapshot,
	Query,
	QuerySnapshot,
	CollectionReference,
} from 'firebase/firestore'

/**
 * Creates a new team and assigns a captain
 * Audited: September 4, 2024
 */
export const createTeam = async (
	playerRef: DocumentReference<PlayerDocument> | undefined,
	name: string | undefined,
	logo: string | undefined,
	seasonRef: DocumentReference<SeasonDocument> | undefined,
	storagePath: string | undefined
) => {
	if (!playerRef || !name || !seasonRef) {
		return
	}

	return (
		// Create the team document so we can update the player document
		addDoc(
			collection(firestore, Collections.TEAMS) as CollectionReference<
				TeamDocument,
				DocumentData
			>,
			{
				logo: logo ? logo : null,
				name: name,
				placement: null,
				registered: false,
				registeredDate: Timestamp.now(),
				roster: [{ captain: true, player: playerRef }],
				season: seasonRef,
				storagePath: storagePath ? storagePath : null,
				teamId: uuidv4(),
			}
		)
			// Get the player document so we can update the player document
			.then((teamDocumentReference) =>
				Promise.all([teamDocumentReference, getDoc(playerRef)])
			)
			// Get the season document so we can update the season document
			.then(([teamDocumentReference, playerDocumentSnapshot]) =>
				Promise.all([
					teamDocumentReference,
					playerDocumentSnapshot,
					getDoc(seasonRef),
				])
			)
			.then(
				([
					teamDocumentReference,
					playerDocumentSnapshot,
					seasonDocumentSnapshot,
				]) =>
					Promise.all([
						// Update the player document
						updateDoc(playerRef, {
							seasons: (playerDocumentSnapshot.data() as PlayerDocument | undefined)
								?.seasons.map((item: PlayerSeason) => ({
									captain:
										item.season.id === seasonRef.id ? true : item.captain,
									paid: item.paid,
									season: item.season,
									signed: item.signed,
									team:
										item.season.id === seasonRef.id
											? teamDocumentReference
											: item.team,
								})),
						}),
						// Update the season document
						updateDoc(seasonRef, {
							teams: (seasonDocumentSnapshot.data() as SeasonDocument | undefined)
								?.teams.concat(teamDocumentReference),
						}),
					])
			)
	)
}

/**
 * Creates a new team with an existing team ID (for rollovers)
 */
export const rolloverTeam = async (
	playerRef: DocumentReference<PlayerDocument> | undefined,
	name: string | undefined,
	logo: string | undefined,
	seasonRef: DocumentReference<SeasonDocument> | undefined,
	storagePath: string | undefined,
	teamId: string | undefined
) => {
	if (!playerRef || !name || !seasonRef || !teamId) {
		return
	}

	// Create the team document so we can update the player document
	const teamDocumentReference = (await addDoc(
		collection(firestore, Collections.TEAMS),
		{
			logo: logo ? logo : null,
			name: name,
			placement: null,
			registered: false,
			registeredDate: Timestamp.now(),
			roster: [{ captain: true, player: playerRef }],
			season: seasonRef,
			storagePath: storagePath ? storagePath : null,
			teamId: teamId,
		}
	)) as DocumentReference<TeamDocument>

	// Get the player document so we can update the player document
	const playerDocumentSnapshot = await getDoc(playerRef)

	// Get the season document so we can update the season document
	const seasonDocumentSnapshot = await getDoc(seasonRef)

	return Promise.all([
		// Update the player document
		updateDoc(playerRef, {
			seasons: (playerDocumentSnapshot.data() as PlayerDocument | undefined)
				?.seasons.map((item: PlayerSeason) => ({
					captain: item.season.id === seasonRef.id ? true : item.captain,
					paid: item.paid,
					season: item.season,
					signed: item.signed,
					team:
						item.season.id === seasonRef.id ? teamDocumentReference : item.team,
				})),
		}),
		// Update the season document
		updateDoc(seasonRef, {
			teams: (seasonDocumentSnapshot.data() as SeasonDocument | undefined)?.teams.concat(teamDocumentReference),
		}),
	])
}

/**
 * Edits team information (name, logo, storage path)
 */
export const editTeam = async (
	teamRef: DocumentReference<TeamDocument> | undefined,
	name: string | undefined,
	logo: string | undefined,
	storagePath: string | undefined
) => {
	if (!teamRef || !name) {
		return
	}

	const teamDocumentSnapshot = await getDoc(teamRef)

	return updateDoc(teamRef, {
		name: name ? name : (teamDocumentSnapshot.data() as TeamDocument | undefined)?.name,
		logo: logo ? logo : (teamDocumentSnapshot.data() as TeamDocument | undefined)?.logo,
		storagePath: storagePath
			? storagePath
			: (teamDocumentSnapshot.data() as TeamDocument | undefined)?.storagePath,
	})
}

/**
 * Deletes a team and cleans up all related data
 * Audited: September 4, 2024
 */
export const deleteTeam = async (
	teamRef: DocumentReference<TeamDocument> | undefined,
	seasonRef: DocumentReference<SeasonDocument> | undefined
) => {
	if (!teamRef || !seasonRef) {
		return
	}

	return (
		(
			getDocs(
				query(
					collection(firestore, Collections.OFFERS),
					where('team', '==', teamRef)
				)
			) as Promise<QuerySnapshot<OfferDocument>>
		)
			// Delete all offers involving this team
			.then((offersQuerySnapshot) =>
				offersQuerySnapshot.docs.map((offer) => deleteDoc(offer.ref))
			)
			// Update all players on this team to remove them from the team
			.then(() => getDoc(teamRef))
			.then((teamDocumentSnapshot) =>
				(teamDocumentSnapshot.data() as TeamDocument | undefined)
					?.roster.map(async (item: TeamRosterPlayer) =>
						getDoc(item.player).then((playerDocumentSnapshot) =>
							updateDoc(playerDocumentSnapshot.ref, {
								seasons: (
									playerDocumentSnapshot.data() as PlayerDocument
								)?.seasons.map((item: PlayerSeason) => ({
									banned: item.banned,
									captain:
										item.season.id === seasonRef.id ? false : item.captain,
									paid: item.paid,
									season: item.season,
									signed: item.signed,
									team: item.season.id === seasonRef.id ? null : item.team,
								})),
							})
						)
					)
			)
			// Update season document to remove the team
			.then(() => getDoc(seasonRef))
			.then((seasonDocumentSnapshot) =>
				updateDoc(seasonRef, {
					teams: (seasonDocumentSnapshot.data() as SeasonDocument | undefined)
						?.teams.filter((team) => team.id !== teamRef.id),
				})
			)
			// Delete team's image from storage
			.then(() => getDoc(teamRef))
			.then((teamDocumentSnapshot) => {
				const url = (teamDocumentSnapshot.data() as TeamDocument | undefined)?.storagePath
				return url ? deleteImage(ref(storage, url)) : Promise.resolve()
			})
			// Delete the team document
			.then(() => deleteDoc(teamRef))
	)
}

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
