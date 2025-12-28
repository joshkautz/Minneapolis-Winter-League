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
 *
 * Uses a transaction to ensure atomicity and prevent race conditions
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

			// Validate admin authentication and get validated user ID
			const userId = await validateAdminUser(auth, firestore)

			// Get user reference for awardedBy field
			const userRef = firestore.collection(Collections.PLAYERS).doc(userId)

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

				// Check if team already has this badge
				if (teamBadgeDoc.exists) {
					throw new HttpsError(
						'already-exists',
						'This badge has already been awarded to the team'
					)
				}

				// Query all teams with same teamId to check if any already have badge
				// Note: Queries in transactions are read-only and provide snapshot isolation
				const teamsWithSameTeamId = await firestore
					.collection(Collections.TEAMS)
					.where('teamId', '==', team.teamId)
					.get()

				let shouldIncrementStats = true

				// Check if any other team instance with same teamId already has this badge
				for (const otherTeam of teamsWithSameTeamId.docs) {
					if (otherTeam.id === teamId) continue

					const otherTeamBadgeDoc = await transaction.get(
						otherTeam.ref.collection(Collections.BADGES).doc(badgeId)
					)

					if (otherTeamBadgeDoc.exists) {
						shouldIncrementStats = false
						break
					}
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

				transaction.set(teamBadgeRef, teamBadgeDocument)

				// Update badge stats if this is the first time this teamId earned it
				if (shouldIncrementStats) {
					if (!badge.stats) {
						transaction.update(badgeRef, {
							stats: {
								totalTeamsAwarded: 1,
								lastUpdated: FieldValue.serverTimestamp(),
							},
						})
					} else {
						transaction.update(badgeRef, {
							'stats.totalTeamsAwarded': FieldValue.increment(1),
							'stats.lastUpdated': FieldValue.serverTimestamp(),
						})
					}
				}

				return {
					badgeName: badge.name,
					teamName: team.name,
					incrementedStats: shouldIncrementStats,
				}
			})

			logger.info('Badge awarded to team successfully', {
				badgeId,
				badgeName: result.badgeName,
				teamId,
				teamName: result.teamName,
				awardedBy: userId,
				incrementedStats: result.incrementedStats,
			})

			return {
				success: true,
				badgeId,
				teamId,
				message: `Badge "${result.badgeName}" awarded to team "${result.teamName}" successfully`,
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
