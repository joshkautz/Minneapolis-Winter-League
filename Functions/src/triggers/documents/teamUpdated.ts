/**
 * Team document update triggers
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'
import { TeamDocument } from '../../types.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { getCurrentSeason } from '../../shared/database.js'
import { updateTeamRegistrationStatus } from '../../services/teamRegistrationService.js'

/**
 * When a team roster changes, update the team's registration status
 *
 * @see https://firebase.google.com/docs/functions/firestore-events#trigger_a_function_when_a_document_is_updated
 */
export const updateTeamRegistrationOnRosterChange = onDocumentUpdated(
	{
		document: 'teams/{teamId}',
		region: FIREBASE_CONFIG.REGION,
	},
	async (event) => {
		const teamId = event.params.teamId

		try {
			const beforeData = event.data?.before.data() as TeamDocument
			const afterData = event.data?.after.data() as TeamDocument
			const teamRef = event.data?.after.ref

			if (!beforeData || !afterData || !teamRef) {
				logger.warn(`Missing team data for team: ${teamId}`)
				return
			}

			// Check if roster size changed
			const rosterSizeChanged =
				beforeData.roster.length !== afterData.roster.length

			if (rosterSizeChanged) {
				const currentSeason = await getCurrentSeason()
				if (currentSeason) {
					await updateTeamRegistrationStatus(teamRef, currentSeason.id)
					logger.info(
						`Updated team registration status for roster change: ${teamId}`
					)
				}
			}
		} catch (error) {
			logger.error('Error updating team registration on roster change:', {
				teamId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
		}
	}
)
