/**
 * Revoke badge from team callable function
 *
 * Removes a badge from a canonical team. Single-write decrement, no
 * teamId-walk dedup needed.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, BadgeDocument } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import {
	teamBadgeRef,
	teamRef as canonicalTeamRef,
} from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface RevokeBadgeRequest {
	badgeId: string
	teamId: string
}

interface RevokeBadgeResponse {
	success: true
	badgeId: string
	teamId: string
	message: string
}

export const revokeBadge = onCall<RevokeBadgeRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<RevokeBadgeResponse> => {
		const { data, auth } = request
		const { badgeId, teamId } = data

		if (!badgeId || !teamId) {
			throw new HttpsError(
				'invalid-argument',
				'Badge ID and Team ID are required'
			)
		}

		try {
			const firestore = getFirestore()
			const userId = await validateAdminUser(auth, firestore)

			const badgeRef = firestore.collection(Collections.BADGES).doc(badgeId)
			const teamCanonicalDocRef = canonicalTeamRef(firestore, teamId)
			const teamBadgeDocRef = teamBadgeRef(firestore, teamId, badgeId)

			const result = await firestore.runTransaction(async (transaction) => {
				const [badgeDoc, teamDoc, teamBadgeDoc] = await Promise.all([
					transaction.get(badgeRef),
					transaction.get(teamCanonicalDocRef),
					transaction.get(teamBadgeDocRef),
				])

				if (!badgeDoc.exists) {
					throw new HttpsError('not-found', 'Badge not found')
				}
				const badge = badgeDoc.data() as BadgeDocument

				if (!teamDoc.exists) {
					throw new HttpsError('not-found', 'Team not found')
				}

				if (!teamBadgeDoc.exists) {
					throw new HttpsError(
						'not-found',
						'This badge has not been awarded to the team'
					)
				}

				transaction.delete(teamBadgeDocRef)

				if (badge.stats) {
					transaction.update(badgeRef, {
						'stats.totalTeamsAwarded': FieldValue.increment(-1),
						'stats.lastUpdated': FieldValue.serverTimestamp(),
					})
				}

				return { badgeName: badge.name }
			})

			logger.info('Badge revoked from team successfully', {
				badgeId,
				badgeName: result.badgeName,
				teamId,
				revokedBy: userId,
			})

			return {
				success: true,
				badgeId,
				teamId,
				message: `Badge "${result.badgeName}" revoked successfully`,
			}
		} catch (error) {
			if (error instanceof HttpsError) throw error
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'
			logger.error('Error revoking badge from team:', {
				userId: auth?.uid,
				badgeId: data.badgeId,
				teamId: data.teamId,
				error: errorMessage,
			})
			throw new HttpsError(
				'internal',
				`Failed to revoke badge: ${errorMessage}`
			)
		}
	}
)
