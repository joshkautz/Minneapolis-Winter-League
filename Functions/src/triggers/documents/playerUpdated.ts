/**
 * Player season update trigger
 *
 * Fires when a player's per-season subdoc changes (paid, signed, captain,
 * team). When paid or signed changes for a player who is on a team,
 * recompute that team's registration status for the season.
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { PlayerSeasonDocument } from '../../types.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { updateTeamRegistrationStatus } from '../../services/teamRegistrationService.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'

export const updateTeamRegistrationOnPlayerChange = onDocumentUpdated(
	{
		document: 'players/{playerId}/playerSeasons/{seasonId}',
		region: FIREBASE_CONFIG.REGION,
		// A throw is only retried with this set; see .claude/rules/functions.md.
		retry: true,
	},
	async (event) => {
		const { playerId, seasonId } = event.params

		if (await isMigrationInProgress(getFirestore())) {
			logger.info(
				'Skipping updateTeamRegistrationOnPlayerChange — migration in progress',
				{ eventId: event.id, playerId, seasonId }
			)
			return
		}

		try {
			const beforeData = event.data?.before.data() as
				PlayerSeasonDocument | undefined
			const afterData = event.data?.after.data() as
				PlayerSeasonDocument | undefined

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
			// Rethrown so the platform retries. A signature that lands during
			// the race and whose recompute is lost costs the team its spot;
			// the recompute is an idempotent transaction, so a retry is safe.
			logger.error('Error updating team registration on player change:', {
				playerId,
				seasonId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw error
		}
	}
)
