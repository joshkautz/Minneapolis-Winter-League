/**
 * Award badge to team callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	BadgeDocument,
	TeamDocument,
	TeamBadgeDocument,
} from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface AwardBadgeRequest {
	badgeId: string
	teamId: string
}

interface AwardBadgeResponse {
	success: true
	badgeId: string
	teamId: string
	message: string
}

/**
 * Awards a badge to a specific team
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - Badge must exist
 * - Team must exist
 * - Badge cannot already be awarded to the team
 */
export const awardBadge = onCall<AwardBadgeRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<AwardBadgeResponse> => {
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

			// Get user reference
			const userRef = firestore.collection(Collections.PLAYERS).doc(auth!.uid)

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

			// Check if team already has this badge
			const teamBadgeRef = teamRef
				.collection(Collections.TEAM_BADGES)
				.doc(badgeId)
			const teamBadgeDoc = await teamBadgeRef.get()

			if (teamBadgeDoc.exists) {
				throw new HttpsError(
					'already-exists',
					'This badge has already been awarded to the team'
				)
			}

			// Create team badge document
			const now = FieldValue.serverTimestamp()
			const teamBadgeDocument: Omit<TeamBadgeDocument, 'awardedAt'> & {
				awardedAt: FirebaseFirestore.FieldValue
			} = {
				badge: badgeRef,
				awardedBy: userRef,
				awardedAt: now,
			}

			await teamBadgeRef.set(teamBadgeDocument)

			logger.info('Badge awarded to team successfully', {
				badgeId,
				badgeName: badge.name,
				teamId,
				teamName: team.name,
				awardedBy: auth!.uid,
			})

			return {
				success: true,
				badgeId,
				teamId,
				message: `Badge "${badge.name}" awarded to team "${team.name}" successfully`,
			}
		} catch (error) {
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error awarding badge to team:', {
				userId: auth!.uid,
				badgeId: data.badgeId,
				teamId: data.teamId,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				`Failed to award badge: ${errorMessage}`
			)
		}
	}
)
