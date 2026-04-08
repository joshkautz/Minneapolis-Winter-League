/**
 * Delete season callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface DeleteSeasonRequest {
	seasonId: string
}

interface DeleteSeasonResponse {
	success: boolean
	message: string
}

/**
 * Deletes a season with proper authorization
 * Removes the season from all players' seasons arrays
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - Season must exist
 *
 * Note: This orphans references in teams, games, offers, etc.
 * Should only be used to correct mistakes (e.g., accidentally created season)
 */
export const deleteSeason = onCall<DeleteSeasonRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { data, auth } = request

		const { seasonId } = data

		// Validate inputs
		if (!seasonId) {
			throw new HttpsError('invalid-argument', 'Season ID is required')
		}

		try {
			const firestore = getFirestore()

			// Validate admin authentication
			await validateAdminUser(auth, firestore)

			// Check if season exists
			const seasonRef = firestore.collection(Collections.SEASONS).doc(seasonId)
			const seasonDoc = await seasonRef.get()

			if (!seasonDoc.exists) {
				throw new HttpsError('not-found', 'Season not found')
			}

			const seasonData = seasonDoc.data()
			const seasonName = seasonData?.name || 'Unknown'

			// Delete each player's season subdoc for this season.
			const playersSnapshot = await firestore
				.collection(Collections.PLAYERS)
				.get()

			let batch = firestore.batch()
			let opsInBatch = 0
			let playersUpdated = 0
			const BATCH_SIZE = 400

			for (const playerDoc of playersSnapshot.docs) {
				const seasonSubdocRef = playerDoc.ref
					.collection('seasons')
					.doc(seasonId)
				const seasonSubdocSnap = await seasonSubdocRef.get()
				if (seasonSubdocSnap.exists) {
					batch.delete(seasonSubdocRef)
					opsInBatch++
					playersUpdated++
					if (opsInBatch >= BATCH_SIZE) {
						await batch.commit()
						batch = firestore.batch()
						opsInBatch = 0
					}
				}
			}

			if (opsInBatch > 0) {
				await batch.commit()
			}

			logger.info(`Season removed from ${playersUpdated} players`, {
				seasonId,
				playersUpdated,
			})

			// Delete the season document
			await seasonRef.delete()

			logger.info(`Season deleted: ${seasonId}`, {
				seasonId,
				seasonName,
				deletedBy: auth?.uid,
				playersUpdated,
			})

			return {
				success: true,
				message: `Season "${seasonName}" deleted successfully and removed from ${playersUpdated} players`,
			} as DeleteSeasonResponse
		} catch (error) {
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error deleting season:', {
				seasonId,
				userId: auth?.uid,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				`Failed to delete season: ${errorMessage}`
			)
		}
	}
)
