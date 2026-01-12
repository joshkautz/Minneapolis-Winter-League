/**
 * Update post callable function
 *
 * Allows users to edit their own posts.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	type DocumentReference,
	type PostDocument,
} from '../../../types.js'
import { validateAuthentication } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface UpdatePostRequest {
	postId: string
	content: string
}

interface UpdatePostResponse {
	success: true
	postId: string
	message: string
}

/**
 * Updates an existing post
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - Post must exist
 * - User must be the author of the post
 * - Content is required and validated (10-2000 characters)
 */
export const updatePost = onCall<
	UpdatePostRequest,
	Promise<UpdatePostResponse>
>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<UpdatePostResponse> => {
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

			// Verify user is the author
			if (postData.author.id !== auth!.uid) {
				throw new HttpsError(
					'permission-denied',
					'You can only edit your own posts'
				)
			}

			// Update the post
			await postRef.update({
				content: trimmedContent,
				updatedAt: FieldValue.serverTimestamp(),
			})

			logger.info('Post updated successfully', {
				postId,
				authorId: auth!.uid,
				contentLength: trimmedContent.length,
			})

			return {
				success: true,
				postId,
				message: 'Post updated successfully',
			}
		} catch (error) {
			if (error instanceof HttpsError) {
				throw error
			}

			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error updating post:', {
				userId: auth?.uid,
				postId: data.postId,
				error: errorMessage,
			})

			throw new HttpsError('internal', `Failed to update post: ${errorMessage}`)
		}
	}
)
