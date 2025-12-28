/**
 * Database utilities for Firebase Functions
 */

import { getFirestore } from 'firebase-admin/firestore'
import { Collections, SeasonDocument } from '../types.js'
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

		const seasonDoc = seasonsSnapshot.docs[0]
		const seasonData = seasonDoc.data() as SeasonDocument
		return { ...seasonData, id: seasonDoc.id }
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
