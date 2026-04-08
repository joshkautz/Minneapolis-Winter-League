/**
 * Player season update trigger
 *
 * Fires when a player's per-season subdoc changes (paid, signed, banned,
 * captain, team). When paid or signed changes for a player who is on a team,
 * recompute that team's registration status for the season.
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'
import { PlayerSeasonDocument } from '../../types.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { updateTeamRegistrationStatus } from '../../services/teamRegistrationService.js'

export const updateTeamRegistrationOnPlayerChange = onDocumentUpdated(
	{
		document: 'players/{playerId}/playerSeasons/{seasonId}',
		region: FIREBASE_CONFIG.REGION,
	},
	async (event) => {
		const { playerId, seasonId } = event.params

		try {
			const beforeData = event.data?.before.data() as
				| PlayerSeasonDocument
				| undefined
			const afterData = event.data?.after.data() as
				| PlayerSeasonDocument
				| undefined

			if (!beforeData || !afterData || !afterData.team) {
				return
			}

			const paymentChanged = beforeData.paid !== afterData.paid
			const waiverChanged = beforeData.signed !== afterData.signed

			if (paymentChanged || waiverChanged) {
				await updateTeamRegistrationStatus(afterData.team.id, seasonId)
				logger.info('Updated team registration after player season change', {
					playerId,
					seasonId,
					teamId: afterData.team.id,
				})
			}
		} catch (error) {
			logger.error('Error updating team registration on player change:', {
				playerId,
				seasonId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
		}
	}
)
