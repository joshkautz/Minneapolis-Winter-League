/**
 * Delete news post callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface DeleteNewsRequest {
	newsId: string
}

interface DeleteNewsResponse {
	success: true
	newsId: string
	message: string
}

/**
 * Deletes a news post with proper authorization
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - News post must exist
 */
export const deleteNews = onCall<DeleteNewsRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<DeleteNewsResponse> => {
		const { data, auth } = request

		const { newsId } = data

		// Validate required fields
		if (!newsId) {
			throw new HttpsError('invalid-argument', 'News ID is required')
		}

		try {
			const firestore = getFirestore()

			// Validate admin authentication
			await validateAdminUser(auth, firestore)

			// Get and verify news post exists
			const newsRef = firestore.collection(Collections.NEWS).doc(newsId)
			const newsDoc = await newsRef.get()

			if (!newsDoc.exists) {
				throw new HttpsError('not-found', 'News post not found')
			}

			// Delete the news post
			await newsRef.delete()

			logger.info('News post deleted successfully', {
				newsId,
				deletedBy: auth?.uid,
			})

			return {
				success: true,
				newsId,
				message: 'News post deleted successfully',
			}
		} catch (error) {
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error deleting news post:', {
				newsId: data.newsId,
				userId: auth?.uid,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				`Failed to delete news post: ${errorMessage}`
			)
		}
	}
)
