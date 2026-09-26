/**
 * Create news post callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { requireText, TEXT_RULES } from '../../../shared/textFields.js'

interface CreateNewsRequest {
	title: string
	content: string
	seasonId: string
}

interface CreateNewsResponse {
	success: true
	newsId: string
	message: string
}

/**
 * Creates a new news post with proper authorization
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - Season must exist
 * - Title and content are required and validated
 */
export const createNews = onCall<CreateNewsRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<CreateNewsResponse> => {
		const { data, auth } = request

		const { title, content, seasonId } = data

		// Validate required fields
		if (!title || !content || !seasonId) {
			throw new HttpsError(
				'invalid-argument',
				'Title, content, and season ID are required'
			)
		}

		requireText(title, TEXT_RULES.newsTitle)

		requireText(content, TEXT_RULES.newsContent)

		try {
			const firestore = getFirestore()

			// Validate admin authentication
			await validateAdminUser(auth, firestore)

			// Get user reference (auth is validated by validateAdminUser above)
			const userRef = firestore
				.collection(Collections.PLAYERS)
				.doc(auth?.uid ?? '')

			// Verify season exists
			const seasonRef = firestore.collection(Collections.SEASONS).doc(seasonId)
			const seasonDoc = await seasonRef.get()

			if (!seasonDoc.exists) {
				throw new HttpsError('not-found', 'Season not found')
			}

			// Create news post
			const now = FieldValue.serverTimestamp()
			const newsRef = firestore.collection(Collections.NEWS).doc()

			await newsRef.set({
				title: title.trim(),
				content: content.trim(),
				author: userRef,
				season: seasonRef,
				createdAt: now,
				updatedAt: now,
			})

			logger.info('News post created successfully', {
				newsId: newsRef.id,
				authorId: auth?.uid,
				seasonId,
				titleLength: title.length,
				contentLength: content.length,
			})

			return {
				success: true,
				newsId: newsRef.id,
				message: 'News post created successfully',
			}
		} catch (error) {
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error creating news post:', {
				userId: auth?.uid,
				seasonId: data.seasonId,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				'The news post could not be published. Please try again.'
			)
		}
	}
)
