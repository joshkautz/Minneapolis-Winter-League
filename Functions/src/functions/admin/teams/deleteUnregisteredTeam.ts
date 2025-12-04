/**
 * Delete unregistered team callable function (Admin only)
 *
 * This function is only invoked via the Admin Dashboard.
 * It deletes an unregistered team for the current season and properly
 * removes all players from the team roster.
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, TeamDocument, PlayerDocument } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { getCurrentSeason } from '../../../shared/database.js'

/**
 * Request interface
 */
interface DeleteUnregisteredTeamRequest {
	/** The team ID to delete */
	teamId: string
}

/**
 * Response interface for deleting an unregistered team
 */
interface DeleteUnregisteredTeamResponse {
	success: boolean
	message: string
	/** ID of the deleted team */
	teamId: string
	/** Name of the deleted team */
	teamName: string
	/** Number of players removed from the team */
	playersRemoved: number
}

/**
 * Deletes an unregistered team and removes all players from the team roster
 *
 * Security validations performed:
 * - User must be authenticated with verified email
 * - User must have admin privileges
 * - Team must exist
 * - Team must belong to the current season
 * - Team must NOT be registered
 *
 * Features:
 * - Removes team reference from all player documents
 * - Sets player captain status to false
 * - Deletes all offers related to the team
 * - Deletes the team document
 * - All operations in a transaction for data consistency
 *
 * @returns {DeleteUnregisteredTeamResponse} Response containing success status and deleted team info
 */
export const deleteUnregisteredTeam = onCall<DeleteUnregisteredTeamRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<DeleteUnregisteredTeamResponse> => {
		try {
			const { auth: authContext, data } = request
			const firestore = getFirestore()

			// Validate admin authentication
			await validateAdminUser(authContext, firestore)

			const { teamId } = data

			if (!teamId) {
				throw new Error('Team ID is required')
			}

			// Get current season
			const currentSeason = await getCurrentSeason()
			if (!currentSeason || !currentSeason.id) {
				throw new Error('No current season found')
			}

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

			// Verify team belongs to current season
			if (teamDocument.season.id !== currentSeason.id) {
				throw new Error(
					'Team does not belong to the current season and cannot be deleted'
				)
			}

			// Verify team is NOT registered
			if (teamDocument.registered) {
				throw new Error(
					'Cannot delete a registered team. Only unregistered teams can be deleted.'
				)
			}

			const teamName = teamDocument.name
			const rosterSize = teamDocument.roster?.length || 0

			logger.info('Admin deleting unregistered team', {
				teamId,
				teamName,
				seasonId: currentSeason.id,
				seasonName: currentSeason.name,
				rosterSize,
				adminUserId: authContext?.uid,
			})

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

							logger.info('Removed player from team', {
								playerId: member.player.id,
								teamId,
								teamName,
							})
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

				logger.info('Deleted offers for team', {
					teamId,
					offersDeleted: offersQuery.size,
				})

				// Delete the team document
				transaction.delete(teamRef)
			})

			logger.info('Successfully deleted unregistered team', {
				teamId,
				teamName,
				seasonId: currentSeason.id,
				rosterSize,
				adminUserId: authContext?.uid,
			})

			return {
				success: true,
				message: `Successfully deleted unregistered team "${teamName}"`,
				teamId,
				teamName,
				playersRemoved: rosterSize,
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error deleting unregistered team:', {
				teamId: request.data.teamId,
				adminUserId: request.auth?.uid,
				error: errorMessage,
			})

			// Re-throw the original error message for better user experience
			throw new Error(errorMessage)
		}
	}
)
