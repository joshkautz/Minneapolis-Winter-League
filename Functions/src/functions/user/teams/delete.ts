/**
 * Delete team callable function
 *
 * Deletes a team's participation in a specific season. Captain check reads
 * the player's season subdoc; the deletion service handles roster + offers
 * + storage cleanup.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { SeasonDocument } from '../../../types.js'
import { validateAuthentication } from '../../../shared/auth.js'
import {
	playerSeasonRef,
	teamSeasonRef,
} from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { formatDateForUser } from '../../../shared/format.js'
import { deleteTeamSeasonWithCleanup } from '../../../services/teamDeletionService.js'

interface DeleteTeamRequest {
	teamId: string
	seasonId: string
	timezone?: string
}

export const deleteTeam = onCall<DeleteTeamRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		validateAuthentication(request.auth)

		const { teamId, seasonId, timezone } = request.data
		const userId = request.auth.uid

		if (!teamId || !seasonId) {
			throw new HttpsError(
				'invalid-argument',
				'Team ID and season ID are required'
			)
		}

		try {
			const firestore = getFirestore()

			// Captain check: read the user's player season subdoc.
			const callerSeasonSnap = await playerSeasonRef(
				firestore,
				userId,
				seasonId
			).get()
			const callerSeason = callerSeasonSnap.data()
			if (
				!callerSeason ||
				callerSeason.team?.id !== teamId ||
				callerSeason.captain !== true
			) {
				throw new HttpsError(
					'permission-denied',
					'Only team captains can delete the team'
				)
			}

			// Verify the team season exists.
			const teamSeasonSnap = await teamSeasonRef(
				firestore,
				teamId,
				seasonId
			).get()
			if (!teamSeasonSnap.exists) {
				throw new HttpsError('not-found', 'Team not found for this season')
			}
			const teamSeasonData = teamSeasonSnap.data()
			if (!teamSeasonData) {
				throw new HttpsError('internal', 'Unable to retrieve team data')
			}

			// Block deletion of registered teams.
			if (teamSeasonData.registered) {
				throw new HttpsError(
					'failed-precondition',
					'Cannot delete a registered team. Teams can only be deleted before they are fully registered.'
				)
			}

			// Block deletion after registration window closes.
			if (teamSeasonData.season) {
				const seasonDoc = await teamSeasonData.season.get()
				if (seasonDoc.exists) {
					const seasonData = seasonDoc.data() as SeasonDocument
					const now = new Date()
					const registrationEnd = seasonData.registrationEnd.toDate()
					if (now > registrationEnd) {
						throw new HttpsError(
							'failed-precondition',
							`Teams cannot be deleted after registration has closed. Registration ended ${formatDateForUser(registrationEnd, timezone)}.`
						)
					}
				}
			}

			const result = await deleteTeamSeasonWithCleanup(
				firestore,
				teamId,
				seasonId
			)

			if (!result.success) {
				throw new HttpsError(
					'internal',
					result.error || 'Failed to delete team'
				)
			}

			logger.info(`Successfully deleted team season: ${teamId}/${seasonId}`, {
				teamName: result.teamName,
				deletedBy: userId,
				playersUpdated: result.playersUpdated,
				offersDeleted: result.offersDeleted,
				logoDeleted: result.logoDeleted,
			})

			return {
				success: true,
				teamId,
				seasonId,
				message: 'Team deleted successfully',
			}
		} catch (error) {
			if (error instanceof HttpsError) throw error
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'
			logger.error('Error deleting team:', {
				teamId,
				seasonId,
				userId,
				error: errorMessage,
			})
			throw new HttpsError('internal', `Failed to delete team: ${errorMessage}`)
		}
	}
)
