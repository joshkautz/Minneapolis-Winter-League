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
} from 'firebase/firestore'
import { Timestamp } from 'firebase/firestore'
import { v4 as uuidv4 } from 'uuid'

import { firestore } from '../app'
import { deleteImage, ref, storage } from '../storage'
import {
	PlayerData,
	SeasonData,
	TeamData,
	OfferData,
	Collections,
} from '@/shared/utils'
import type {
	DocumentReference,
	QueryDocumentSnapshot,
	Query,
	QuerySnapshot,
	CollectionReference,
	DocumentData,
} from '../types'

/**
 * Creates a new team and assigns a captain
 * Audited: September 4, 2024
 */
export const createTeam = async (
	playerRef: DocumentReference<PlayerData, DocumentData> | undefined,
	name: string | undefined,
	logo: string | undefined,
	seasonRef: DocumentReference<SeasonData, DocumentData> | undefined,
	storagePath: string | undefined
) => {
	if (!playerRef || !name || !seasonRef) {
		return
	}

	return (
		// Create the team document so we can update the player document
		addDoc(
			collection(firestore, Collections.TEAMS) as CollectionReference<
				TeamData,
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
							seasons: playerDocumentSnapshot.data()?.seasons.map((item) => ({
								captain: item.season.id === seasonRef.id ? true : item.captain,
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
							teams: seasonDocumentSnapshot
								.data()
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
	playerRef: DocumentReference<PlayerData, DocumentData> | undefined,
	name: string | undefined,
	logo: string | undefined,
	seasonRef: DocumentReference<SeasonData, DocumentData> | undefined,
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
	)) as DocumentReference<TeamData, DocumentData>

	// Get the player document so we can update the player document
	const playerDocumentSnapshot = await getDoc(playerRef)

	// Get the season document so we can update the season document
	const seasonDocumentSnapshot = await getDoc(seasonRef)

	return Promise.all([
		// Update the player document
		updateDoc(playerRef, {
			seasons: playerDocumentSnapshot.data()?.seasons.map((item) => ({
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
			teams: seasonDocumentSnapshot.data()?.teams.concat(teamDocumentReference),
		}),
	])
}

/**
 * Edits team information (name, logo, storage path)
 */
export const editTeam = async (
	teamRef: DocumentReference<TeamData, DocumentData> | undefined,
	name: string | undefined,
	logo: string | undefined,
	storagePath: string | undefined
) => {
	if (!teamRef || !name) {
		return
	}

	const teamDocumentSnapshot = await getDoc(teamRef)

	return updateDoc(teamRef, {
		name: name ? name : teamDocumentSnapshot.data()?.name,
		logo: logo ? logo : teamDocumentSnapshot.data()?.logo,
		storagePath: storagePath
			? storagePath
			: teamDocumentSnapshot.data()?.storagePath,
	})
}

/**
 * Deletes a team and cleans up all related data
 * Audited: September 4, 2024
 */
export const deleteTeam = async (
	teamRef: DocumentReference<TeamData, DocumentData> | undefined,
	seasonRef: DocumentReference<SeasonData, DocumentData> | undefined
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
			) as Promise<QuerySnapshot<OfferData, DocumentData>>
		)
			// Delete all offers involving this team
			.then((offersQuerySnapshot) =>
				offersQuerySnapshot.docs.map((offer) => deleteDoc(offer.ref))
			)
			// Update all players on this team to remove them from the team
			.then(() => getDoc(teamRef))
			.then((teamDocumentSnapshot) =>
				teamDocumentSnapshot.data()?.roster.map(async (item) =>
					getDoc(item.player).then((playerDocumentSnapshot) =>
						updateDoc(playerDocumentSnapshot.ref, {
							seasons: (
								playerDocumentSnapshot.data() as PlayerData
							)?.seasons.map((item) => ({
								captain: item.season.id === seasonRef.id ? false : item.team,
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
					teams: seasonDocumentSnapshot
						.data()
						?.teams.filter((team) => team.id !== teamRef.id),
				})
			)
			// Delete team's image from storage
			.then(() => getDoc(teamRef))
			.then((teamDocumentSnapshot) => {
				const url = teamDocumentSnapshot.data()!.storagePath
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
): DocumentReference<TeamData, DocumentData> | undefined => {
	if (!id) {
		return
	}

	return doc(firestore, Collections.TEAMS, id) as DocumentReference<
		TeamData,
		DocumentData
	>
}

/**
 * Creates a query for multiple teams by their references
 */
export const teamsQuery = (
	teams: (DocumentReference<TeamData, DocumentData> | null)[] | undefined
): Query<TeamData, DocumentData> | undefined => {
	if (!teams || !teams.length) {
		return
	}

	return query(
		collection(firestore, Collections.TEAMS),
		where(documentId(), 'in', teams)
	) as Query<TeamData, DocumentData>
}

/**
 * Creates a query for teams with the same team ID (for history tracking)
 */
export const teamsHistoryQuery = (
	id: string | undefined
): Query<TeamData, DocumentData> | undefined => {
	if (!id) {
		return undefined
	}

	return query(
		collection(firestore, Collections.TEAMS),
		where('teamId', '==', id)
	) as Query<TeamData, DocumentData>
}

/**
 * Creates a query for all teams in a specific season
 */
export const currentSeasonTeamsQuery = (
	seasonSnapshot: QueryDocumentSnapshot<SeasonData, DocumentData> | undefined
): Query<TeamData, DocumentData> | undefined => {
	if (!seasonSnapshot) {
		return undefined
	}

	return query(
		collection(firestore, Collections.TEAMS),
		where('season', '==', seasonSnapshot.ref)
	) as Query<TeamData, DocumentData>
}

/**
 * Creates a query for teams by season reference
 */
export const teamsBySeasonQuery = (
	seasonRef: DocumentReference<SeasonData, DocumentData> | undefined
): Query<TeamData, DocumentData> | undefined => {
	if (!seasonRef) {
		return
	}
	return query(
		collection(firestore, Collections.TEAMS),
		where('season', '==', seasonRef)
	) as Query<TeamData, DocumentData>
}
