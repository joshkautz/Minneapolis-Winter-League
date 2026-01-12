/**
 * Create post callable function
 *
 * Allows authenticated users with verified emails to create posts
 * seeking teams for a specific season.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	type DocumentReference,
	type PlayerDocument,
} from '../../../types.js'
import {
	validateAuthentication,
	validateNotBanned,
} from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface CreatePostRequest {
	content: string
	seasonId: string
}

interface CreatePostResponse {
	success: true
	postId: string
	message: string
}

/**
 * Creates a new post
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must not be banned for the season
 * - Season must exist
 * - Content is required and validated (10-2000 characters)
 */
export const createPost = onCall<
	CreatePostRequest,
	Promise<CreatePostResponse>
>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<CreatePostResponse> => {
		const { data, auth } = request

		// Validate authentication
		validateAuthentication(auth)

		const { content, seasonId } = data

		// Validate required fields
		if (!content || !seasonId) {
			throw new HttpsError(
				'invalid-argument',
				'Content and season ID are required'
			)
		}

		// Validate content length (10-2000 characters)
		const trimmedContent = content.trim()
		if (trimmedContent.length < 10) {
			throw new HttpsError(
				'invalid-argument',
				'Post content must be at least 10 characters long'
			)
		}

		if (trimmedContent.length > 2000) {
			throw new HttpsError(
				'invalid-argument',
				'Post content must not exceed 2,000 characters'
			)
		}

		try {
			const firestore = getFirestore()

			// Get player document and check banned status
			const playerRef = firestore
				.collection(Collections.PLAYERS)
				.doc(auth!.uid) as DocumentReference<PlayerDocument>
			const playerDoc = await playerRef.get()

			if (!playerDoc.exists) {
				throw new HttpsError('not-found', 'Player profile not found')
			}

			const playerData = playerDoc.data()
			validateNotBanned(playerData, seasonId)

			// Verify season exists
			const seasonRef = firestore.collection(Collections.SEASONS).doc(seasonId)
			const seasonDoc = await seasonRef.get()

			if (!seasonDoc.exists) {
				throw new HttpsError('not-found', 'Season not found')
			}

			// Create post
			const now = FieldValue.serverTimestamp()
			const postRef = firestore.collection(Collections.POSTS).doc()

			await postRef.set({
				author: playerRef,
				season: seasonRef,
				content: trimmedContent,
				createdAt: now,
				updatedAt: now,
				replyCount: 0,
			})

			logger.info('Post created successfully', {
				postId: postRef.id,
				authorId: auth!.uid,
				seasonId,
				contentLength: trimmedContent.length,
			})

			return {
				success: true,
				postId: postRef.id,
				message: 'Post created successfully',
			}
		} catch (error) {
			if (error instanceof HttpsError) {
				throw error
			}

			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error creating post:', {
				userId: auth?.uid,
				seasonId: data.seasonId,
				error: errorMessage,
			})

			throw new HttpsError('internal', `Failed to create post: ${errorMessage}`)
		}
	}
)
