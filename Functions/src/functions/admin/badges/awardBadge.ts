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

			// Get user reference - auth is validated by validateAdminUser above
			const uid = auth?.uid ?? ''
			const userRef = firestore.collection(Collections.PLAYERS).doc(uid)

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
			const teamBadgeRef = teamRef.collection(Collections.BADGES).doc(badgeId)
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

			// Check if this is the first time this unique teamId has received this badge
			// Query all teams with this teamId to see if any already had the badge
			const teamsWithSameTeamId = await firestore
				.collection(Collections.TEAMS)
				.where('teamId', '==', team.teamId)
				.get()

			let shouldIncrementStats = true

			// Check if any other team instance with same teamId already has this badge
			for (const otherTeam of teamsWithSameTeamId.docs) {
				// Skip the current team we just awarded to
				if (otherTeam.id === teamId) {
					continue
				}

				// Check if this other team has the badge
				const otherTeamBadgeDoc = await otherTeam.ref
					.collection(Collections.BADGES)
					.doc(badgeId)
					.get()

				if (otherTeamBadgeDoc.exists) {
					// Another team with same teamId already has this badge
					shouldIncrementStats = false
					break
				}
			}

			// Increment the badge stats if this is the first time this teamId earned it
			if (shouldIncrementStats) {
				// Initialize stats if they don't exist (for badges created before stats field)
				if (!badge.stats) {
					await badgeRef.update({
						stats: {
							totalTeamsAwarded: 1,
							lastUpdated: FieldValue.serverTimestamp(),
						},
					})
				} else {
					await badgeRef.update({
						'stats.totalTeamsAwarded': FieldValue.increment(1),
						'stats.lastUpdated': FieldValue.serverTimestamp(),
					})
				}
			}

			logger.info('Badge awarded to team successfully', {
				badgeId,
				badgeName: badge.name,
				teamId,
				teamName: team.name,
				awardedBy: uid,
				incrementedStats: shouldIncrementStats,
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
				userId: auth?.uid,
				badgeId: data.badgeId,
				teamId: data.teamId,
				error: errorMessage,
			})

			throw new HttpsError('internal', `Failed to award badge: ${errorMessage}`)
		}
	}
)
