/**
 * Award badge to team callable function
 *
 * Awards a badge to a canonical team. The badges subcollection lives on the
 * canonical team, so there's exactly one place to write and the team-id
 * dedup walk that the legacy implementation needed is gone.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	BadgeDocument,
	TeamBadgeDocument,
} from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import {
	getCurrentSeason,
	teamBadgeRef,
	teamRef as canonicalTeamRef,
} from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface AwardBadgeRequest {
	badgeId: string
	teamId: string
	/** Optional season id during which the badge was earned. Defaults to the current season. */
	seasonId?: string
}

interface AwardBadgeResponse {
	success: true
	badgeId: string
	teamId: string
	message: string
}

export const awardBadge = onCall<AwardBadgeRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<AwardBadgeResponse> => {
		const { data, auth } = request
		const { badgeId, teamId, seasonId: providedSeasonId } = data

		if (!badgeId || !teamId) {
			throw new HttpsError(
				'invalid-argument',
				'Badge ID and Team ID are required'
			)
		}

		try {
			const firestore = getFirestore()
			const userId = await validateAdminUser(auth, firestore)
			const userRef = firestore.collection(Collections.PLAYERS).doc(userId)

			// Resolve seasonId — explicit > current.
			let seasonId = providedSeasonId
			if (!seasonId) {
				const currentSeason = await getCurrentSeason()
				if (!currentSeason) {
					throw new HttpsError(
						'failed-precondition',
						'No current season found and no seasonId provided'
					)
				}
				seasonId = currentSeason.id
			}

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

				if (teamBadgeDoc.exists) {
					throw new HttpsError(
						'already-exists',
						'This badge has already been awarded to the team'
					)
				}

				const teamBadgeDocument: Omit<TeamBadgeDocument, 'awardedAt'> & {
					awardedAt: FirebaseFirestore.FieldValue
				} = {
					badge: badgeRef,
					awardedBy: userRef,
					awardedAt: FieldValue.serverTimestamp(),
					seasonId: seasonId as string,
				}
				transaction.set(teamBadgeDocRef, teamBadgeDocument)

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

				return { badgeName: badge.name }
			})

			logger.info('Badge awarded to team successfully', {
				badgeId,
				badgeName: result.badgeName,
				teamId,
				seasonId,
				awardedBy: userId,
			})

			return {
				success: true,
				badgeId,
				teamId,
				message: `Badge "${result.badgeName}" awarded to team successfully`,
			}
		} catch (error) {
			if (error instanceof HttpsError) throw error
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
