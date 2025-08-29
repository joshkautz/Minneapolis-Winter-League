/**
 * Delete team callable function
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections } from '@minneapolis-winter-league/shared'
import { validateAuthentication } from '../../shared/auth.js'

interface DeleteTeamRequest {
	teamId: string
}

export const deleteTeam = onCall<DeleteTeamRequest>(
	{ region: 'us-central1' },
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

			const teamData = teamDoc.data()

			// Check if user is a captain of this team
			const userIsCaptain = teamData?.roster?.some(
				(member: any) => member.player.id === userId && member.captain
			)

			if (!userIsCaptain) {
				throw new Error('Only team captains can delete the team')
			}

			// Use transaction to ensure data consistency
			await firestore.runTransaction(async (transaction) => {
				// Remove team from all players' season data
				if (teamData?.roster) {
					for (const member of teamData.roster) {
						const playerDoc = await member.player.get()
						if (playerDoc.exists) {
							const playerData = playerDoc.data()
							const updatedSeasons = playerData?.seasons?.map((season: any) =>
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
				teamName: teamData?.name,
				deletedBy: userId,
				rosterSize: teamData?.roster?.length || 0,
			})

			return {
				success: true,
				teamId,
				message: 'Team deleted successfully',
			}
		} catch (error) {
			logger.error('Error deleting team:', {
				teamId,
				userId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new Error(
				error instanceof Error ? error.message : 'Failed to delete team'
			)
		}
	}
)
