/**
 * Delete reply callable function (admin only)
 *
 * Allows admins to delete any reply.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	type DocumentReference,
	type PostDocument,
	type ReplyDocument,
} from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface DeleteReplyRequest {
	postId: string
	replyId: string
}

interface DeleteReplyResponse {
	success: true
	replyId: string
	message: string
}

/**
 * Deletes a reply and decrements the post's reply count
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - Reply must exist
 */
export const deleteReply = onCall<
	DeleteReplyRequest,
	Promise<DeleteReplyResponse>
>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<DeleteReplyResponse> => {
		const { data, auth } = request

		const { postId, replyId } = data

		// Validate required fields
		if (!postId || !replyId) {
			throw new HttpsError(
				'invalid-argument',
				'Post ID and reply ID are required'
			)
		}

		try {
			const firestore = getFirestore()

			// Validate admin authentication
			await validateAdminUser(auth, firestore)

			// Get post and reply references
			const postRef = firestore
				.collection(Collections.POSTS)
				.doc(postId) as DocumentReference<PostDocument>
			const replyRef = postRef
				.collection('replies')
				.doc(replyId) as DocumentReference<ReplyDocument>

			// Delete reply and decrement count in a transaction
			await firestore.runTransaction(async (transaction) => {
				// Check that both post and reply exist
				const [postDoc, replyDoc] = await Promise.all([
					transaction.get(postRef),
					transaction.get(replyRef),
				])

				if (!postDoc.exists) {
					throw new HttpsError('not-found', 'Post not found')
				}

				if (!replyDoc.exists) {
					throw new HttpsError('not-found', 'Reply not found')
				}

				// Delete the reply
				transaction.delete(replyRef)

				// Decrement reply count
				transaction.update(postRef, {
					replyCount: FieldValue.increment(-1),
				})
			})

			logger.info('Reply deleted successfully', {
				postId,
				replyId,
				deletedBy: auth?.uid,
			})

			return {
				success: true,
				replyId,
				message: 'Reply deleted successfully',
			}
		} catch (error) {
			if (error instanceof HttpsError) {
				throw error
			}

			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error deleting reply:', {
				userId: auth?.uid,
				postId: data.postId,
				replyId: data.replyId,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				`Failed to delete reply: ${errorMessage}`
			)
		}
	}
)
