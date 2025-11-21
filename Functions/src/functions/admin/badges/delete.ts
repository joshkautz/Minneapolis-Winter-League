/**
 * Delete badge callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { Collections, BadgeDocument, TeamDocument } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface DeleteBadgeRequest {
	badgeId: string
}

interface DeleteBadgeResponse {
	success: true
	badgeId: string
	message: string
	teamsAffected: number
}

/**
 * Deletes a badge and removes it from all teams
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - Badge must exist
 *
 * This function will:
 * 1. Delete the badge image from storage
 * 2. Remove the badge from all teams' badge subcollections
 * 3. Delete the badge document
 */
export const deleteBadge = onCall<DeleteBadgeRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<DeleteBadgeResponse> => {
		const { data, auth } = request

		const { badgeId } = data

		// Validate required fields
		if (!badgeId) {
			throw new HttpsError('invalid-argument', 'Badge ID is required')
		}

		try {
			const firestore = getFirestore()

			// Validate admin authentication
			await validateAdminUser(auth, firestore)

			// Verify badge exists
			const badgeRef = firestore.collection(Collections.BADGES).doc(badgeId)
			const badgeDoc = await badgeRef.get()

			if (!badgeDoc.exists) {
				throw new HttpsError('not-found', 'Badge not found')
			}

			const badge = badgeDoc.data() as BadgeDocument

			// Delete badge image from storage if it exists
			if (badge.storagePath) {
				try {
					const storage = getStorage()
					const bucket = storage.bucket()
					const file = bucket.file(badge.storagePath)
					await file.delete()
					logger.info(`Deleted badge image: ${badge.storagePath}`)
				} catch (deleteError) {
					logger.warn(
						'Failed to delete badge image (may not exist):',
						deleteError
					)
					// Continue with badge deletion even if image deletion fails
				}
			}

			// Find all teams that have this badge using collectionGroup query
			const teamBadgesQuery = firestore
				.collectionGroup(Collections.TEAM_BADGES)
				.where('badge', '==', badgeRef)

			const teamBadgesSnapshot = await teamBadgesQuery.get()

			// Delete badge from all teams using batch operations
			let teamsAffected = 0
			const batchSize = 500 // Firestore batch limit
			const batches: FirebaseFirestore.WriteBatch[] = []
			let currentBatch = firestore.batch()
			let operationCount = 0

			for (const teamBadgeDoc of teamBadgesSnapshot.docs) {
				currentBatch.delete(teamBadgeDoc.ref)
				operationCount++
				teamsAffected++

				// Create new batch if current one is full
				if (operationCount >= batchSize) {
					batches.push(currentBatch)
					currentBatch = firestore.batch()
					operationCount = 0
				}
			}

			// Add the last batch if it has operations
			if (operationCount > 0) {
				batches.push(currentBatch)
			}

			// Add badge deletion to the last batch
			currentBatch.delete(badgeRef)

			// Commit all batches
			for (const batch of batches) {
				await batch.commit()
			}

			logger.info('Badge deleted successfully', {
				badgeId,
				deletedBy: auth!.uid,
				teamsAffected,
				hadImage: !!badge.storagePath,
			})

			return {
				success: true,
				badgeId,
				message: `Badge deleted successfully. Removed from ${teamsAffected} team(s).`,
				teamsAffected,
			}
		} catch (error) {
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error deleting badge:', {
				userId: auth!.uid,
				badgeId: data.badgeId,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				`Failed to delete badge: ${errorMessage}`
			)
		}
	}
)
