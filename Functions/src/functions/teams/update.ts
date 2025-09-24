/**
 * Update team callable function
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, TeamDocument } from '../../types.js'
import { validateAuthentication } from '../../shared/auth.js'

interface EditTeamRequest {
	teamId: string
	name?: string
	logo?: string
	storagePath?: string
}

/**
 * Edits team information (name, logo, storage path)
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be a captain of the team
 * - At least one field must be provided to update
 */
export const updateTeam = onCall<EditTeamRequest>(
	{ region: 'us-central1' },
	async (request) => {
		validateAuthentication(request.auth)

		const { teamId, name, logo, storagePath } = request.data
		const userId = request.auth!.uid

		if (!teamId) {
			throw new Error('Team ID is required')
		}

		if (!name && logo === undefined && storagePath === undefined) {
			throw new Error('At least one field must be provided to update')
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
				throw new Error('Only team captains can edit team information')
			}

			// Build update data
			const updateData: Record<string, unknown> = {}
			if (name !== undefined) {
				if (typeof name !== 'string' || name.trim() === '') {
					throw new Error('Team name must be a non-empty string')
				}
				updateData.name = name.trim()
			}
			if (logo !== undefined) {
				updateData.logo = logo
			}
			if (storagePath !== undefined) {
				updateData.storagePath = storagePath
			}

			// Update team document
			await teamRef.update(updateData)

			logger.info(`Successfully updated team: ${teamId}`, {
				updatedFields: Object.keys(updateData),
				updatedBy: userId,
			})

			return {
				success: true,
				teamId,
				message: 'Team updated successfully',
			}
		} catch (error) {
			logger.error('Error updating team:', {
				teamId,
				userId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new Error(
				error instanceof Error ? error.message : 'Failed to update team'
			)
		}
	}
)
