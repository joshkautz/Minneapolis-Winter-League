/**
 * Delete unregistered team callable function (Admin only)
 *
 * Deletes an unregistered team's participation in the current season.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import {
	getCurrentSeason,
	teamSeasonRef,
} from '../../../shared/database.js'
import { deleteTeamSeasonWithCleanup } from '../../../services/teamDeletionService.js'

interface DeleteUnregisteredTeamRequest {
	teamId: string
}

interface DeleteUnregisteredTeamResponse {
	success: boolean
	message: string
	teamId: string
	teamName: string
	playersRemoved: number
}

export const deleteUnregisteredTeam = onCall<DeleteUnregisteredTeamRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<DeleteUnregisteredTeamResponse> => {
		try {
			const { auth: authContext, data } = request
			const firestore = getFirestore()

			await validateAdminUser(authContext, firestore)

			const { teamId } = data
			if (!teamId) {
				throw new HttpsError('invalid-argument', 'Team ID is required')
			}

			const currentSeason = await getCurrentSeason()
			if (!currentSeason || !currentSeason.id) {
				throw new HttpsError('not-found', 'No current season found')
			}
			const seasonId = currentSeason.id

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
				throw new HttpsError(
					'internal',
					result.error || 'Failed to delete team'
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
			throw new HttpsError('internal', errorMessage)
		}
	}
)
