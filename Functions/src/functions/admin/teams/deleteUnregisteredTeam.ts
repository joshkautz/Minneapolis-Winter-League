/**
 * Delete unregistered team callable function (Admin only)
 *
 * Deletes an unregistered team's participation in the current season.
 *
 * Security validations performed:
 * - Caller must be an admin.
 * - The request names the season, and it must be the current one. Team
 *   Management lists any season, and this used to take only the team and
 *   delete its current-season entry, so a Delete pressed while viewing a
 *   past season removed the team from this season instead.
 * - The team must not be registered. A registered team's money is settled
 *   through the Payments dialog; it is never deleted here.
 * - `deleteTeamSeasonWithCleanup` refuses a team still holding money.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { getCurrentSeason, teamSeasonRef } from '../../../shared/database.js'
import { deleteTeamSeasonWithCleanup } from '../../../services/teamDeletionService.js'

interface DeleteUnregisteredTeamRequest {
	teamId: string
	/** The season the admin was looking at; must be the current season. */
	seasonId: string
}

interface DeleteUnregisteredTeamResponse {
	success: boolean
	message: string
	teamId: string
	teamName: string
	playersRemoved: number
}

export const deleteUnregisteredTeam = onCall<DeleteUnregisteredTeamRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<DeleteUnregisteredTeamResponse> => {
		try {
			const { auth: authContext, data } = request
			const firestore = getFirestore()

			await validateAdminUser(authContext, firestore)

			const { teamId, seasonId: requestedSeasonId } = data
			if (!teamId || !requestedSeasonId) {
				throw new HttpsError(
					'invalid-argument',
					'Team ID and season ID are required'
				)
			}

			const currentSeason = await getCurrentSeason()
			if (!currentSeason || !currentSeason.id) {
				throw new HttpsError('not-found', 'No current season found')
			}
			const seasonId = currentSeason.id
			if (requestedSeasonId !== seasonId) {
				throw new HttpsError(
					'failed-precondition',
					`Only teams in the current season, ${currentSeason.name}, can be deleted.`
				)
			}

			// Verify the team has a season subdoc for the current season.
			const teamSeasonDocRef = teamSeasonRef(firestore, teamId, seasonId)
			const teamSeasonSnap = await teamSeasonDocRef.get()
			if (!teamSeasonSnap.exists) {
				throw new HttpsError(
					'not-found',
					'Team does not have a participation record for the current season'
				)
			}
			const teamSeasonData = teamSeasonSnap.data()
			if (teamSeasonData?.registered) {
				throw new HttpsError(
					'failed-precondition',
					'Cannot delete a registered team. Only unregistered teams can be deleted.'
				)
			}

			logger.info('Admin deleting unregistered team season', {
				teamId,
				seasonId,
				teamName: teamSeasonData?.name,
				adminUserId: authContext?.uid,
			})

			const result = await deleteTeamSeasonWithCleanup(
				firestore,
				teamId,
				seasonId,
				{ skipRegisteredCheck: true }
			)

			if (!result.success) {
				// A refusal says why; anything else was logged by the service.
				throw result.errorCode &&
					result.errorCode !== 'internal' &&
					result.error
					? new HttpsError(result.errorCode, result.error)
					: new HttpsError(
							'internal',
							'The team could not be deleted. Please try again.'
						)
			}

			logger.info('Successfully deleted unregistered team', {
				teamId,
				seasonId,
				teamName: result.teamName,
				playersUpdated: result.playersUpdated,
				offersDeleted: result.offersDeleted,
				logoDeleted: result.logoDeleted,
			})

			return {
				success: true,
				message: `Successfully deleted unregistered team "${result.teamName}"`,
				teamId,
				teamName: result.teamName,
				playersRemoved: result.playersUpdated,
			}
		} catch (error) {
			if (error instanceof HttpsError) throw error
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'
			logger.error('Error deleting unregistered team:', {
				teamId: request.data.teamId,
				adminUserId: request.auth?.uid,
				error: errorMessage,
			})
			throw new HttpsError(
				'internal',
				'The team could not be deleted. Please try again.'
			)
		}
	}
)
