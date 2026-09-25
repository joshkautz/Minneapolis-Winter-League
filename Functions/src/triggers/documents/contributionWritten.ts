/**
 * Team contribution trigger
 *
 * Fires when a team's contribution ledger changes, and recomputes whether the
 * team has now registered.
 *
 * Under team-total pricing money is one of the two registration conditions,
 * so a change to it has to be able to register a team. The other triggers
 * that recompute registration fire on roster and waiver changes only. Without
 * this one, a team that signed all its players in advance and then had its
 * captain pay the moment registration opened — the case team-total pricing
 * exists to make fast — would never register at all: the money would arrive
 * last, and nothing would notice.
 *
 * Only the paid total can change the outcome, so a write that leaves the
 * status and amount alone (a metadata update, say) is skipped.
 *
 * It then settles the team whenever a new payment lands. A payment can land
 * where it is no longer wanted: on a team that registered while the payer
 * was on the Checkout page, in a season that filled up, after registration
 * closed, from a payer who left the team mid-checkout. Settlement refunds it
 * or keeps it, by the same rules as everywhere else. Refunds settlement makes
 * itself do not settle again.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { updateTeamRegistrationStatus } from '../../services/teamRegistrationService.js'
import { settleTeamSeason } from '../../services/teamSettlementService.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'

export const updateTeamRegistrationOnContributionChange = onDocumentWritten(
	{
		document:
			'teams/{teamId}/teamSeasons/{seasonId}/contributions/{paymentIntentId}',
		region: FIREBASE_CONFIG.REGION,
		// A throw is only retried with this set; see .claude/rules/functions.md.
		retry: true,
		secrets: ['STRIPE_SECRET_KEY'],
	},
	async (event) => {
		const { teamId, seasonId, paymentIntentId } = event.params

		if (await isMigrationInProgress(getFirestore())) {
			logger.info(
				'Skipping updateTeamRegistrationOnContributionChange — migration in progress',
				{ eventId: event.id, teamId, seasonId, paymentIntentId }
			)
			return
		}

		const before = event.data?.before.data()
		const after = event.data?.after.data()
		const statusChanged = before?.status !== after?.status
		const amountChanged = before?.amountCents !== after?.amountCents
		if (!statusChanged && !amountChanged) return

		try {
			await updateTeamRegistrationStatus(teamId, seasonId)

			const newPayment = after?.status === 'paid' && before === undefined
			if (newPayment) {
				await settleTeamSeason(teamId, seasonId)
			}
		} catch (error) {
			// Rethrown so the platform retries. In a race for twelve spots a
			// missed recompute costs a team the spot it just paid for, and the
			// recompute is a transaction that short-circuits once a team is
			// registered. Settlement reads Stripe before acting and keys every
			// write, so a retry after a partial settlement finishes the job.
			logger.error('Error handling a contribution change', {
				teamId,
				seasonId,
				paymentIntentId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw error
		}
	}
)
