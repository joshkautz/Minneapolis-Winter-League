/**
 * Delete team callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	TeamDocument,
	PlayerDocument,
	SeasonDocument,
} from '../../../types.js'
import { validateAuthentication } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { formatDateForUser } from '../../../shared/format.js'

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

			// Check if registration has ended
			if (teamDocument.season) {
				const seasonDoc = await teamDocument.season.get()
				if (seasonDoc.exists) {
					const seasonData = seasonDoc.data() as SeasonDocument
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

			// Use transaction to ensure data consistency
			await firestore.runTransaction(async (transaction) => {
				// Remove team from all players' season data
				if (teamDocument.roster) {
					for (const member of teamDocument.roster) {
						const playerDoc = await member.player.get()
						if (playerDoc.exists) {
							const playerDocument = playerDoc.data() as
								| PlayerDocument
								| undefined
							const updatedSeasons =
								playerDocument?.seasons?.map((season) =>
									season.team?.id === teamId
										? { ...season, team: null, captain: false }
										: season
								) || []

							transaction.update(member.player, { seasons: updatedSeasons })
						}
					}
				}

				// Delete all offers related to this team
				const offersQuery = await firestore
					.collection(Collections.OFFERS)
					.where('team', '==', teamRef)
					.get()

				offersQuery.docs.forEach((doc) => {
					transaction.delete(doc.ref)
				})

				// Delete the team document
				transaction.delete(teamRef)
			})

			logger.info(`Successfully deleted team: ${teamId}`, {
				teamName: teamDocument?.name,
				deletedBy: userId,
				rosterSize: teamDocument?.roster?.length || 0,
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
