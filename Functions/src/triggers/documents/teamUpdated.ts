/**
 * Team-season roster trigger
 *
 * Fires when a roster entry is created or deleted under a team's season
 * subcollection. Recomputes the team's registration status for that season.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { updateTeamRegistrationStatus } from '../../services/teamRegistrationService.js'

export const updateTeamRegistrationOnRosterChange = onDocumentWritten(
	{
		document: 'teams/{teamId}/seasons/{seasonId}/roster/{playerId}',
		region: FIREBASE_CONFIG.REGION,
	},
	async (event) => {
		const { teamId, seasonId } = event.params

		// Only react to creates and deletes; updates to existing roster entries
		// don't change the registration count.
		const before = event.data?.before
		const after = event.data?.after
		const wasCreatedOrDeleted = !before?.exists || !after?.exists
		if (!wasCreatedOrDeleted) return

		try {
			await updateTeamRegistrationStatus(teamId, seasonId)
			logger.info(
				`Updated team registration status for roster change: ${teamId}/${seasonId}`
			)
		} catch (error) {
			logger.error('Error updating team registration on roster change:', {
				teamId,
				seasonId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
		}
	}
)
