/**
 * Update news post callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerDocument, NewsDocument } from '../../types.js'
import { validateAuthentication } from '../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'

interface UpdateNewsRequest {
	newsId: string
	title?: string
	content?: string
	seasonId?: string
}

interface UpdateNewsResponse {
	success: true
	newsId: string
	message: string
}

/**
 * Updates an existing news post with proper authorization
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - News post must exist
 * - At least one field must be updated
 * - Title and content are validated if provided
 */
export const updateNews = onCall<UpdateNewsRequest>(
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

		const { newsId, title, content, seasonId } = data

		// Validate required fields
		if (!newsId) {
			throw new HttpsError('invalid-argument', 'News ID is required')
		}

		// At least one field must be provided for update
		if (!title && !content && !seasonId) {
			throw new HttpsError(
				'invalid-argument',
				'At least one field (title, content, or seasonId) must be provided for update'
			)
		}

		// Validate title if provided
		if (title !== undefined) {
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
		}

		// Validate content if provided
		if (content !== undefined) {
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
					'Only administrators can update news posts'
				)
			}

			// Get and verify news post exists
			const newsRef = firestore.collection(Collections.NEWS).doc(newsId)
			const newsDoc = await newsRef.get()

			if (!newsDoc.exists) {
				throw new HttpsError('not-found', 'News post not found')
			}

			// Verify season exists if seasonId is provided
			if (seasonId) {
				const seasonRef = firestore
					.collection(Collections.SEASONS)
					.doc(seasonId)
				const seasonDoc = await seasonRef.get()

				if (!seasonDoc.exists) {
					throw new HttpsError('not-found', 'Season not found')
				}
			}

			// Build update object
			const updateData: any = {
				updatedAt: FieldValue.serverTimestamp(),
			}

			if (title !== undefined) {
				updateData.title = title.trim()
			}

			if (content !== undefined) {
				updateData.content = content.trim()
			}

			if (seasonId) {
				updateData.season = firestore
					.collection(Collections.SEASONS)
					.doc(seasonId)
			}

			// Update news post
			await newsRef.update(updateData)

			logger.info('News post updated successfully', {
				newsId,
				updatedBy: auth!.uid,
				updatedFields: Object.keys(updateData).filter((k) => k !== 'updatedAt'),
			})

			return {
				success: true,
				newsId,
				message: 'News post updated successfully',
			}
		} catch (error) {
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error updating news post:', {
				newsId: data.newsId,
				userId: auth!.uid,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				`Failed to update news post: ${errorMessage}`
			)
		}
	}
)
