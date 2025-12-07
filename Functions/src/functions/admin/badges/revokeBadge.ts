/**
 * Revoke badge from team callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
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

			// Check if any other teams with the same teamId still have this badge
			// Query all teams with this teamId
			const teamsWithSameTeamId = await firestore
				.collection(Collections.TEAMS)
				.where('teamId', '==', team.teamId)
				.get()

			let shouldDecrementStats = true

			// Check if any other team instance with same teamId still has this badge
			for (const otherTeam of teamsWithSameTeamId.docs) {
				// Skip the current team we just revoked from
				if (otherTeam.id === teamId) {
					continue
				}

				// Check if this other team still has the badge
				const otherTeamBadgeDoc = await otherTeam.ref
					.collection(Collections.BADGES)
					.doc(badgeId)
					.get()

				if (otherTeamBadgeDoc.exists) {
					// Another team with same teamId still has this badge
					shouldDecrementStats = false
					break
				}
			}

			// Decrement the badge stats if no other teams with this teamId have the badge
			if (shouldDecrementStats) {
				await badgeRef.update({
					'stats.totalTeamsAwarded': FieldValue.increment(-1),
					'stats.lastUpdated': FieldValue.serverTimestamp(),
				})
			}

			logger.info('Badge revoked from team successfully', {
				badgeId,
				badgeName: badge.name,
				teamId,
				teamName: team.name,
				revokedBy: auth?.uid,
				decrementedStats: shouldDecrementStats,
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
