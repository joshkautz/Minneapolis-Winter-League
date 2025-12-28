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
 *
 * Uses a transaction to ensure atomicity and prevent race conditions
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

			// Validate admin authentication and get validated user ID
			const userId = await validateAdminUser(auth, firestore)

			// Document references
			const badgeRef = firestore.collection(Collections.BADGES).doc(badgeId)
			const teamRef = firestore.collection(Collections.TEAMS).doc(teamId)
			const teamBadgeRef = teamRef.collection(Collections.BADGES).doc(badgeId)

			// Execute all operations atomically in a transaction
			const result = await firestore.runTransaction(async (transaction) => {
				// Read all documents first (Firestore transaction requirement)
				const [badgeDoc, teamDoc, teamBadgeDoc] = await Promise.all([
					transaction.get(badgeRef),
					transaction.get(teamRef),
					transaction.get(teamBadgeRef),
				])

				// Validate badge exists
				if (!badgeDoc.exists) {
					throw new HttpsError('not-found', 'Badge not found')
				}
				const badge = badgeDoc.data() as BadgeDocument

				// Validate team exists
				if (!teamDoc.exists) {
					throw new HttpsError('not-found', 'Team not found')
				}
				const team = teamDoc.data() as TeamDocument

				// Check if team has this badge
				if (!teamBadgeDoc.exists) {
					throw new HttpsError(
						'not-found',
						'This badge has not been awarded to the team'
					)
				}

				// Query all teams with same teamId to check if any still have badge
				// Note: Queries in transactions are read-only and provide snapshot isolation
				const teamsWithSameTeamId = await firestore
					.collection(Collections.TEAMS)
					.where('teamId', '==', team.teamId)
					.get()

				let shouldDecrementStats = true

				// Check if any other team instance with same teamId still has this badge
				for (const otherTeam of teamsWithSameTeamId.docs) {
					if (otherTeam.id === teamId) continue

					const otherTeamBadgeDoc = await transaction.get(
						otherTeam.ref.collection(Collections.BADGES).doc(badgeId)
					)

					if (otherTeamBadgeDoc.exists) {
						shouldDecrementStats = false
						break
					}
				}

				// Delete team badge document
				transaction.delete(teamBadgeRef)

				// Decrement badge stats if no other teams with this teamId have the badge
				if (shouldDecrementStats && badge.stats) {
					transaction.update(badgeRef, {
						'stats.totalTeamsAwarded': FieldValue.increment(-1),
						'stats.lastUpdated': FieldValue.serverTimestamp(),
					})
				}

				return {
					badgeName: badge.name,
					teamName: team.name,
					decrementedStats: shouldDecrementStats,
				}
			})

			logger.info('Badge revoked from team successfully', {
				badgeId,
				badgeName: result.badgeName,
				teamId,
				teamName: result.teamName,
				revokedBy: userId,
				decrementedStats: result.decrementedStats,
			})

			return {
				success: true,
				badgeId,
				teamId,
				message: `Badge "${result.badgeName}" revoked from team "${result.teamName}" successfully`,
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
