/**
 * Delete post callable function (admin only)
 *
 * Allows admins to delete any post along with all its replies.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	type DocumentReference,
	type PostDocument,
} from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface DeletePostRequest {
	postId: string
}

interface DeletePostResponse {
	success: true
	postId: string
	message: string
	repliesDeleted: number
}

/**
 * Deletes a post and all its replies
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - Post must exist
 */
export const deletePost = onCall<
	DeletePostRequest,
	Promise<DeletePostResponse>
>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<DeletePostResponse> => {
		const { data, auth } = request

		const { postId } = data

		// Validate required fields
		if (!postId) {
			throw new HttpsError('invalid-argument', 'Post ID is required')
		}

		try {
			const firestore = getFirestore()

			// Validate admin authentication
			await validateAdminUser(auth, firestore)

			// Get post document
			const postRef = firestore
				.collection(Collections.POSTS)
				.doc(postId) as DocumentReference<PostDocument>
			const postDoc = await postRef.get()

			if (!postDoc.exists) {
				throw new HttpsError('not-found', 'Post not found')
			}

			// Delete all replies in the subcollection
			const repliesSnapshot = await postRef.collection('replies').get()
			const repliesDeleted = repliesSnapshot.size

			// Use batched writes for efficiency (max 500 operations per batch)
			const BATCH_SIZE = 500
			const batches: FirebaseFirestore.WriteBatch[] = []
			let currentBatch = firestore.batch()
			let operationCount = 0

			for (const replyDoc of repliesSnapshot.docs) {
				currentBatch.delete(replyDoc.ref)
				operationCount++

				if (operationCount >= BATCH_SIZE) {
					batches.push(currentBatch)
					currentBatch = firestore.batch()
					operationCount = 0
				}
			}

			// Add the post deletion to the final batch
			currentBatch.delete(postRef)
			batches.push(currentBatch)

			// Commit all batches
			for (const batch of batches) {
				await batch.commit()
			}

			logger.info('Post deleted successfully', {
				postId,
				deletedBy: auth?.uid,
				repliesDeleted,
			})

			return {
				success: true,
				postId,
				message: `Post deleted successfully${repliesDeleted > 0 ? ` along with ${repliesDeleted} ${repliesDeleted === 1 ? 'reply' : 'replies'}` : ''}`,
				repliesDeleted,
			}
		} catch (error) {
			if (error instanceof HttpsError) {
				throw error
			}

			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error deleting post:', {
				userId: auth?.uid,
				postId: data.postId,
				error: errorMessage,
			})

			throw new HttpsError('internal', `Failed to delete post: ${errorMessage}`)
		}
	}
)
