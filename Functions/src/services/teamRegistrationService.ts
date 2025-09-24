/**
 * Team registration status management service
 */

import { logger } from 'firebase-functions/v2'
import { TeamDocument } from '../types.js'
import { TEAM_CONFIG } from '../config/constants.js'
import { countRegisteredPlayersOnTeam } from '../shared/database.js'

/**
 * Helper function to update a team's registration status
 */
export async function updateTeamRegistrationStatus(
	teamRef: FirebaseFirestore.DocumentReference,
	seasonId: string
): Promise<void> {
	try {
		const teamDoc = await teamRef.get()
		if (!teamDoc.exists) {
			logger.warn(`Team document not found: ${teamRef.id}`)
			return
		}

		const teamDocument = teamDoc.data() as TeamDocument

		// Count registered players on the team
		const registeredCount = await countRegisteredPlayersOnTeam(
			teamDocument.roster,
			seasonId
		)

		// Determine if team should be registered
		const shouldBeRegistered =
			registeredCount >= TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION

		// Update registration status if it changed
		if (teamDocument.registered !== shouldBeRegistered) {
			await teamRef.update({
				registered: shouldBeRegistered,
				registeredDate: shouldBeRegistered ? new Date() : null,
				registeredPlayerCount: registeredCount,
			})

			logger.info(`Updated team registration status`, {
				teamId: teamRef.id,
				registered: shouldBeRegistered,
				playerCount: registeredCount,
			})
		}
	} catch (error) {
		logger.error('Error updating team registration status:', {
			teamId: teamRef.id,
			error: error instanceof Error ? error.message : 'Unknown error',
		})
		throw error
	}
}
