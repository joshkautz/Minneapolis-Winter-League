/**
 * Delete team callable function
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, TeamDocument, PlayerDocument } from '../../types.js'
import { validateAuthentication } from '../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'

interface DeleteTeamRequest {
	teamId: string
}

export const deleteTeam = onCall<DeleteTeamRequest>(
	{
		region: FIREBASE_CONFIG.REGION,
		cors: [...FIREBASE_CONFIG.CORS_ORIGINS],
		invoker: 'public',
	},
	async (request) => {
		validateAuthentication(request.auth)

		const { teamId } = request.data
		const userId = request.auth!.uid

		if (!teamId) {
			throw new Error('Team ID is required')
		}

		try {
			const firestore = getFirestore()

			// Get team document
			const teamRef = firestore.collection(Collections.TEAMS).doc(teamId)
			const teamDoc = await teamRef.get()

			if (!teamDoc.exists) {
				throw new Error('Team not found')
			}

			const teamDocument = teamDoc.data() as TeamDocument | undefined

			if (!teamDocument) {
				throw new Error('Unable to retrieve team data')
			}

			// Check if user is a captain of this team
			const userIsCaptain = teamDocument.roster?.some(
				(member) => member.player.id === userId && member.captain
			)

			if (!userIsCaptain) {
				throw new Error('Only team captains can delete the team')
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
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error deleting team:', {
				teamId,
				userId,
				error: errorMessage,
			})

			// Re-throw the original error message for better user experience
			throw new Error(errorMessage)
		}
	}
)
