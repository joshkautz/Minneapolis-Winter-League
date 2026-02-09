/**
 * Delete team callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, TeamDocument, SeasonDocument } from '../../../types.js'
import { validateAuthentication } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { formatDateForUser } from '../../../shared/format.js'
import { deleteTeamWithCleanup } from '../../../services/teamDeletionService.js'

interface DeleteTeamRequest {
	teamId: string
}

export const deleteTeam = onCall<DeleteTeamRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		validateAuthentication(request.auth)

		const { teamId } = request.data
		const userId = request.auth?.uid ?? ''

		if (!teamId) {
			throw new HttpsError('invalid-argument', 'Team ID is required')
		}

		try {
			const firestore = getFirestore()

			// Get team document
			const teamRef = firestore.collection(Collections.TEAMS).doc(teamId)
			const teamDoc = await teamRef.get()

			if (!teamDoc.exists) {
				throw new HttpsError('not-found', 'Team not found')
			}

			const teamDocument = teamDoc.data() as TeamDocument | undefined

			if (!teamDocument) {
				throw new HttpsError('internal', 'Unable to retrieve team data')
			}

			// Check if user is a captain of this team
			const userIsCaptain = teamDocument.roster?.some(
				(member) => member.player.id === userId && member.captain
			)

			if (!userIsCaptain) {
				throw new HttpsError(
					'permission-denied',
					'Only team captains can delete the team'
				)
			}

			// Prevent deletion of registered teams
			if (teamDocument.registered) {
				throw new HttpsError(
					'failed-precondition',
					'Cannot delete a registered team. Teams can only be deleted before they are fully registered.'
				)
			}

			// Check if registration has ended
			let seasonId: string | undefined
			if (teamDocument.season) {
				const seasonDoc = await teamDocument.season.get()
				if (seasonDoc.exists) {
					const seasonData = seasonDoc.data() as SeasonDocument
					seasonId = seasonDoc.id
					const now = new Date()
					const registrationEnd = seasonData.registrationEnd.toDate()

					if (now > registrationEnd) {
						throw new HttpsError(
							'failed-precondition',
							`Teams cannot be deleted after registration has closed. Registration ended ${formatDateForUser(registrationEnd)}.`
						)
					}
				}
			}

			if (!seasonId) {
				throw new HttpsError('internal', 'Unable to determine season')
			}

			// Use shared deletion service
			const result = await deleteTeamWithCleanup(
				firestore,
				teamRef as FirebaseFirestore.DocumentReference<TeamDocument>,
				seasonId
			)

			if (!result.success) {
				throw new HttpsError(
					'internal',
					result.error || 'Failed to delete team'
				)
			}

			logger.info(`Successfully deleted team: ${teamId}`, {
				teamName: result.teamName,
				deletedBy: userId,
				playersUpdated: result.playersUpdated,
				offersDeleted: result.offersDeleted,
				karmaTransactionsDeleted: result.karmaTransactionsDeleted,
				logoDeleted: result.logoDeleted,
			})

			return {
				success: true,
				teamId,
				message: 'Team deleted successfully',
			}
		} catch (error) {
			// Re-throw HttpsError as-is
			if (error instanceof HttpsError) {
				throw error
			}

			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error deleting team:', {
				teamId,
				userId,
				error: errorMessage,
			})

			throw new HttpsError('internal', `Failed to delete team: ${errorMessage}`)
		}
	}
)
