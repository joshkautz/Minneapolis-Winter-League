/**
 * Revoke badge from team callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, BadgeDocument, TeamDocument } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
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

/**
 * Revokes a badge from a specific team
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - Badge must exist
 * - Team must exist
 * - Team must have the badge to revoke it
 */
export const revokeBadge = onCall<RevokeBadgeRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<RevokeBadgeResponse> => {
		const { data, auth } = request

		const { badgeId, teamId } = data

		// Validate required fields
		if (!badgeId || !teamId) {
			throw new HttpsError(
				'invalid-argument',
				'Badge ID and Team ID are required'
			)
		}

		try {
			const firestore = getFirestore()

			// Validate admin authentication
			await validateAdminUser(auth, firestore)

			// Verify badge exists
			const badgeRef = firestore.collection(Collections.BADGES).doc(badgeId)
			const badgeDoc = await badgeRef.get()

			if (!badgeDoc.exists) {
				throw new HttpsError('not-found', 'Badge not found')
			}

			const badge = badgeDoc.data() as BadgeDocument

			// Verify team exists
			const teamRef = firestore.collection(Collections.TEAMS).doc(teamId)
			const teamDoc = await teamRef.get()

			if (!teamDoc.exists) {
				throw new HttpsError('not-found', 'Team not found')
			}

			const team = teamDoc.data() as TeamDocument

			// Check if team has this badge
			const teamBadgeRef = teamRef.collection(Collections.BADGES).doc(badgeId)
			const teamBadgeDoc = await teamBadgeRef.get()

			if (!teamBadgeDoc.exists) {
				throw new HttpsError(
					'not-found',
					'This badge has not been awarded to the team'
				)
			}

			// Delete team badge document
			await teamBadgeRef.delete()

			logger.info('Badge revoked from team successfully', {
				badgeId,
				badgeName: badge.name,
				teamId,
				teamName: team.name,
				revokedBy: auth!.uid,
			})

			return {
				success: true,
				badgeId,
				teamId,
				message: `Badge "${badge.name}" revoked from team "${team.name}" successfully`,
			}
		} catch (error) {
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error revoking badge from team:', {
				userId: auth!.uid,
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
