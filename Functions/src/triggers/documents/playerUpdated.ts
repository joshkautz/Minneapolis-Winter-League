/**
 * Player document update triggers
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'
import { PlayerDocument } from '../../types.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { getCurrentSeason } from '../../shared/database.js'
import { updateTeamRegistrationStatus } from '../../services/teamRegistrationService.js'

/**
 * When a player's payment/waiver status changes, update their team's registration status
 *
 * @see https://firebase.google.com/docs/functions/firestore-events#trigger_a_function_when_a_document_is_updated
 */
export const updateTeamRegistrationOnPlayerChange = onDocumentUpdated(
	{
		document: 'players/{playerId}',
		region: FIREBASE_CONFIG.REGION,
	},
	async (event) => {
		const playerId = event.params.playerId

		try {
			const beforeData = event.data?.before.data() as PlayerDocument
			const afterData = event.data?.after.data() as PlayerDocument

			if (!beforeData || !afterData) {
				logger.warn(`Missing player data for player: ${playerId}`)
				return
			}

			const currentSeason = await getCurrentSeason()
			if (!currentSeason) {
				logger.warn('No current season found')
				return
			}

			// Find current season data for this player
			const beforeSeasonData = beforeData.seasons?.find(
				(season) => season.season.id === currentSeason.id
			)
			const afterSeasonData = afterData.seasons?.find(
				(season) => season.season.id === currentSeason.id
			)

			if (!beforeSeasonData || !afterSeasonData || !afterSeasonData.team) {
				return
			}

			// Check if payment or waiver status changed
			const paymentChanged = beforeSeasonData.paid !== afterSeasonData.paid
			const waiverChanged = beforeSeasonData.signed !== afterSeasonData.signed

			if (paymentChanged || waiverChanged) {
				await updateTeamRegistrationStatus(afterSeasonData.team, currentSeason.id)
				logger.info(`Updated team registration status for player change: ${playerId}`)
			}
		} catch (error) {
			logger.error('Error updating team registration on player change:', {
				playerId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
		}
	}
)
