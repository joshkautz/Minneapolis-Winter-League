/**
 * Update reply callable function
 *
 * Allows users to edit their own replies.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	type DocumentReference,
	type ReplyDocument,
} from '../../../types.js'
import { validateAuthentication } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { requireText, TEXT_RULES } from '../../../shared/textFields.js'

interface UpdateReplyRequest {
	postId: string
	replyId: string
	content: string
}

interface UpdateReplyResponse {
	success: true
	replyId: string
	message: string
}

/**
 * Updates an existing reply
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - Reply must exist
 * - User must be the author of the reply
 * - Content is required and validated (10-1000 characters)
 */
export const updateReply = onCall<
	UpdateReplyRequest,
	Promise<UpdateReplyResponse>
>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<UpdateReplyResponse> => {
		const { data, auth } = request

		// Validate authentication
		validateAuthentication(auth)

		const { postId, replyId, content } = data

		// Validate required fields
		if (!postId || !replyId || !content) {
			throw new HttpsError(
				'invalid-argument',
				'Post ID, reply ID, and content are required'
			)
		}

		const trimmedContent = requireText(content, TEXT_RULES.replyContent)

		try {
			const firestore = getFirestore()

			// Get reply document
			const replyRef = firestore
				.collection(Collections.POSTS)
				.doc(postId)
				.collection('replies')
				.doc(replyId) as DocumentReference<ReplyDocument>
			const replyDoc = await replyRef.get()

			if (!replyDoc.exists) {
				throw new HttpsError('not-found', 'Reply not found')
			}

			const replyData = replyDoc.data()
			if (!replyData) {
				throw new HttpsError('internal', 'Unable to retrieve reply data')
			}

			// Verify user is the author
			if (replyData.author.id !== auth.uid) {
				throw new HttpsError(
					'permission-denied',
					'You can only edit your own replies'
				)
			}

			// Update the reply
			await replyRef.update({
				content: trimmedContent,
				updatedAt: FieldValue.serverTimestamp(),
			})

			logger.info('Reply updated successfully', {
				postId,
				replyId,
				authorId: auth.uid,
				contentLength: trimmedContent.length,
			})

			return {
				success: true,
				replyId,
				message: 'Reply updated successfully',
			}
		} catch (error) {
			if (error instanceof HttpsError) {
				throw error
			}

			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error updating reply:', {
				userId: auth?.uid,
				postId: data.postId,
				replyId: data.replyId,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				'Your reply could not be saved. Please try again.'
			)
		}
	}
)
