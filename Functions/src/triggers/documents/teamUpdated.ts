/**
 * Team-season roster trigger
 *
 * Fires when a roster entry is created or deleted under a team's season
 * subcollection. Recomputes the team's registration status for that season,
 * and when someone leaves, settles the team's money: a payer who leaves a
 * team that has not registered is refunded straight away, rather than at
 * the next hourly sweep. See `planSettlement`.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { updateTeamRegistrationStatus } from '../../services/teamRegistrationService.js'
import { settleTeamSeason } from '../../services/teamSettlementService.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'

export const updateTeamRegistrationOnRosterChange = onDocumentWritten(
	{
		document: 'teams/{teamId}/teamSeasons/{seasonId}/roster/{playerId}',
		region: FIREBASE_CONFIG.REGION,
		// A throw is only retried with this set; see .claude/rules/functions.md.
		retry: true,
		secrets: ['STRIPE_SECRET_KEY'],
	},
	async (event) => {
		const { teamId, seasonId } = event.params

		if (await isMigrationInProgress(getFirestore())) {
			logger.info(
				'Skipping updateTeamRegistrationOnRosterChange — migration in progress',
				{ eventId: event.id, teamId, seasonId }
			)
			return
		}

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

			// Registration first, so the settlement sees whether the team is
			// in. Cheap when the leaver paid nothing: it reads, finds no
			// action, and never calls Stripe.
			if (!after?.exists) {
				await settleTeamSeason(teamId, seasonId)
			}
		} catch (error) {
			// Rethrown so the platform retries; see playerUpdated.ts.
			logger.error('Error updating team registration on roster change:', {
				teamId,
				seasonId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw error
		}
	}
)
