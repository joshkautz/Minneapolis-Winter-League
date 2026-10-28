/**
 * Resolve ban review callable function
 *
 * An admin's decision on a player flagged as possibly a banned player under
 * a new account (`services/banEvasion.ts`): ban the account, or mark it as
 * someone else. Either closes the review; a dismissed review is not raised
 * again for the same banned accounts.
 *
 * Security validations:
 * - Caller must be an admin
 * - `playerId` must name an open review, and `decision` be 'ban' or
 *   'dismiss'
 * - The ban and the review's close are one transaction
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { Collections, type BanReviewDocument } from '../../../types.js'

interface ResolveBanReviewRequest {
	playerId: string
	decision: 'ban' | 'dismiss'
}

export const resolveBanReview = onCall<ResolveBanReviewRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<{ status: BanReviewDocument['status'] }> => {
		const firestore = getFirestore()
		const adminId = await validateAdminUser(request.auth, firestore)

		const { playerId, decision } = request.data ?? {}
		if (typeof playerId !== 'string' || playerId.length === 0) {
			throw new HttpsError('invalid-argument', 'Choose a player.')
		}
		if (decision !== 'ban' && decision !== 'dismiss') {
			throw new HttpsError(
				'invalid-argument',
				'Choose whether to ban the account or dismiss the review.'
			)
		}

		const reviewRef = firestore
			.collection(Collections.BAN_REVIEWS)
			.doc(playerId)
		const playerRef = firestore.collection(Collections.PLAYERS).doc(playerId)
		const status = await firestore.runTransaction(async (txn) => {
			const review = (await txn.get(reviewRef)).data() as
				BanReviewDocument | undefined
			if (!review) {
				throw new HttpsError('not-found', 'There is no review for this player.')
			}
			if (review.status !== 'open') {
				throw new HttpsError(
					'failed-precondition',
					'This review has already been decided.'
				)
			}
			const player = await txn.get(playerRef)
			const next: BanReviewDocument['status'] =
				decision === 'ban' ? 'banned' : 'dismissed'
			if (decision === 'ban') {
				if (!player.exists) {
					throw new HttpsError(
						'not-found',
						'This player has deleted their account.'
					)
				}
				txn.update(playerRef, { banned: true })
			}
			txn.update(reviewRef, {
				status: next,
				resolvedAt: FieldValue.serverTimestamp(),
				resolvedBy: adminId,
			})
			return next
		})

		logger.info('Ban review resolved', { adminId, playerId, status })
		return { status }
	}
)
