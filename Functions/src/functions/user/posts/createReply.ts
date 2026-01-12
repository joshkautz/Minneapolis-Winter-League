/**
 * Create reply callable function
 *
 * Allows authenticated users with verified emails to reply to posts.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	type DocumentReference,
	type PostDocument,
	type PlayerDocument,
} from '../../../types.js'
import {
	validateAuthentication,
	validateNotBanned,
} from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface CreateReplyRequest {
	postId: string
	content: string
}

interface CreateReplyResponse {
	success: true
	replyId: string
	message: string
}

/**
 * Creates a reply to a post
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must not be banned for the season
 * - Parent post must exist
 * - Content is required and validated (10-1000 characters)
 */
export const createReply = onCall<
	CreateReplyRequest,
	Promise<CreateReplyResponse>
>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<CreateReplyResponse> => {
		const { data, auth } = request

		// Validate authentication
		validateAuthentication(auth)

		const { postId, content } = data

		// Validate required fields
		if (!postId || !content) {
			throw new HttpsError(
				'invalid-argument',
				'Post ID and content are required'
			)
		}

		// Validate content length (10-1000 characters)
		const trimmedContent = content.trim()
		if (trimmedContent.length < 10) {
			throw new HttpsError(
				'invalid-argument',
				'Reply content must be at least 10 characters long'
			)
		}

		if (trimmedContent.length > 1000) {
			throw new HttpsError(
				'invalid-argument',
				'Reply content must not exceed 1,000 characters'
			)
		}

		try {
			const firestore = getFirestore()

			// Get post document
			const postRef = firestore
				.collection(Collections.POSTS)
				.doc(postId) as DocumentReference<PostDocument>
			const postDoc = await postRef.get()

			if (!postDoc.exists) {
				throw new HttpsError('not-found', 'Post not found')
			}

			const postData = postDoc.data()
			if (!postData) {
				throw new HttpsError('internal', 'Unable to retrieve post data')
			}

			// Get player document and check banned status
			const playerRef = firestore
				.collection(Collections.PLAYERS)
				.doc(auth!.uid) as DocumentReference<PlayerDocument>
			const playerDoc = await playerRef.get()

			if (!playerDoc.exists) {
				throw new HttpsError('not-found', 'Player profile not found')
			}

			const playerData = playerDoc.data()
			const seasonId = postData.season.id
			validateNotBanned(playerData, seasonId)

			// Create reply and increment reply count in a transaction
			let replyId: string = ''
			await firestore.runTransaction(async (transaction) => {
				// Re-read post to ensure consistency
				const freshPostDoc = await transaction.get(postRef)
				if (!freshPostDoc.exists) {
					throw new HttpsError('not-found', 'Post not found')
				}

				// Create reply document
				const replyRef = postRef.collection('replies').doc()
				replyId = replyRef.id

				const now = FieldValue.serverTimestamp()
				transaction.set(replyRef, {
					author: playerRef,
					content: trimmedContent,
					createdAt: now,
					updatedAt: now,
				})

				// Increment reply count
				transaction.update(postRef, {
					replyCount: FieldValue.increment(1),
				})
			})

			logger.info('Reply created successfully', {
				postId,
				replyId,
				authorId: auth!.uid,
				contentLength: trimmedContent.length,
			})

			return {
				success: true,
				replyId,
				message: 'Reply posted successfully',
			}
		} catch (error) {
			if (error instanceof HttpsError) {
				throw error
			}

			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error creating reply:', {
				userId: auth?.uid,
				postId: data.postId,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				`Failed to create reply: ${errorMessage}`
			)
		}
	}
)
