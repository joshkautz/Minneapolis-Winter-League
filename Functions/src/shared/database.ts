/**
 * Database utilities for Firebase Functions
 */

import { getFirestore } from 'firebase-admin/firestore'
import {
	Collections,
	SeasonDocument,
	PlayerDocument,
	PlayerSeason,
	TeamRosterPlayer,
} from '../types.js'
import { logger } from 'firebase-functions/v2'

/**
 * Gets the current season (most recent by dateStart)
 */
export async function getCurrentSeason(): Promise<SeasonDocument | null> {
	try {
		const firestore = getFirestore()
		const seasonsSnapshot = await firestore
			.collection(Collections.SEASONS)
			.orderBy('dateStart', 'desc')
			.limit(1)
			.get()

		if (seasonsSnapshot.empty) {
			logger.warn('No seasons found in database')
			return null
		}

		return seasonsSnapshot.docs[0].data() as SeasonDocument
	} catch (error) {
		logger.error('Error getting current season:', error)
		throw new Error('Failed to get current season')
	}
}

/**
 * Gets the current season document reference
 */
export async function getCurrentSeasonRef(): Promise<FirebaseFirestore.DocumentReference> {
	const firestore = getFirestore()
	const seasonsSnapshot = await firestore
		.collection(Collections.SEASONS)
		.orderBy('dateStart', 'desc')
		.limit(1)
		.get()

	if (seasonsSnapshot.empty) {
		throw new Error('No current season found')
	}

	return seasonsSnapshot.docs[0].ref
}

/**
 * Checks if a player is registered (paid and signed) for the current season
 */
export function isPlayerRegisteredForSeason(
	playerDocument: PlayerDocument,
	seasonId: string
): boolean {
	const seasonData = playerDocument.seasons?.find(
		(season: PlayerSeason) => season.season.id === seasonId
	)

	return Boolean(seasonData?.paid && seasonData?.signed)
}

/**
 * Counts registered players on a team for the current season
 */
export async function countRegisteredPlayersOnTeam(
	teamRoster: TeamRosterPlayer[],
	seasonId: string
): Promise<number> {
	// Get all player documents
	const playerPromises = teamRoster.map((member) => member.player.get())
	const playerDocs = await Promise.all(playerPromises)

	// Count registered players
	return playerDocs.filter((playerDoc: FirebaseFirestore.DocumentSnapshot) => {
		const playerDocument = playerDoc.data() as PlayerDocument
		return isPlayerRegisteredForSeason(playerDocument, seasonId)
	}).length
}
