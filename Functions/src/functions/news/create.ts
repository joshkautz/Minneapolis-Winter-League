/**
 * Create news post callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerDocument } from '../../types.js'
import { validateAuthentication } from '../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'

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
	async (request) => {
		const { data, auth } = request

		// Validate authentication
		try {
			validateAuthentication(auth)
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Authentication failed'
			throw new HttpsError('unauthenticated', errorMessage)
		}

		const { title, content, seasonId } = data

		// Validate required fields
		if (!title || !content || !seasonId) {
			throw new HttpsError(
				'invalid-argument',
				'Title, content, and season ID are required'
			)
		}

		// Validate title length (min 3, max 200 characters)
		if (title.trim().length < 3) {
			throw new HttpsError(
				'invalid-argument',
				'Title must be at least 3 characters long'
			)
		}

		if (title.length > 200) {
			throw new HttpsError(
				'invalid-argument',
				'Title must not exceed 200 characters'
			)
		}

		// Validate content length (min 10, max 10000 characters)
		if (content.trim().length < 10) {
			throw new HttpsError(
				'invalid-argument',
				'Content must be at least 10 characters long'
			)
		}

		if (content.length > 10000) {
			throw new HttpsError(
				'invalid-argument',
				'Content must not exceed 10,000 characters'
			)
		}

		try {
			const firestore = getFirestore()

			// Verify user is an admin
			const userRef = firestore.collection(Collections.PLAYERS).doc(auth!.uid)
			const userDoc = await userRef.get()

			if (!userDoc.exists) {
				throw new HttpsError('not-found', 'User profile not found')
			}

			const userData = userDoc.data() as PlayerDocument | undefined
			if (!userData?.admin) {
				throw new HttpsError(
					'permission-denied',
					'Only administrators can create news posts'
				)
			}

			// Verify season exists
			const seasonRef = firestore
				.collection(Collections.SEASONS)
				.doc(seasonId)
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
				authorId: auth!.uid,
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
				userId: auth!.uid,
				seasonId: data.seasonId,
				error: errorMessage,
			})

			throw new HttpsError('internal', `Failed to create news post: ${errorMessage}`)
		}
	}
)
