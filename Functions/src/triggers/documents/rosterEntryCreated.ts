/**
 * Waiver request trigger
 *
 * Fires when a player is added to a team's roster for a season, and sends
 * them their waiver.
 *
 * Waivers used to be sent by `onPaymentCreated`, which worked only while
 * every player paid for themselves. Under team-level payment one person can
 * pay for the whole team, so tying the waiver to a payment would leave
 * everyone else without one — and since a team needs ten *signed* players to
 * register, that team could never register at all.
 *
 * Joining a roster is the event every player has in common, whoever paid.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'
import { requestWaiver } from '../../shared/waivers.js'

export const onRosterEntryCreated = onDocumentCreated(
	{
		document: 'teams/{teamId}/teamSeasons/{seasonId}/roster/{playerId}',
		region: FIREBASE_CONFIG.REGION,
		secrets: ['DROPBOX_SIGN_API_KEY'],
	},
	async (event) => {
		const { teamId, seasonId, playerId } = event.params
		const firestore = getFirestore()

		if (await isMigrationInProgress(firestore)) {
			logger.info('Skipping onRosterEntryCreated — migration in progress', {
				eventId: event.id,
				teamId,
				seasonId,
				playerId,
			})
			return
		}

		try {
			const result = await requestWaiver(firestore, { playerId, seasonId })

			logger.info('Waiver request on roster join', {
				teamId,
				seasonId,
				playerId,
				...result,
			})
		} catch (error) {
			// Rethrow so the trigger retries: a transient Dropbox Sign failure
			// would otherwise leave a player silently without a waiver, which
			// nothing else in the system surfaces. `requestWaiver` is
			// idempotent on (player, season), so a retry cannot double-send.
			logger.error('Failed to request a waiver on roster join', {
				teamId,
				seasonId,
				playerId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw error
		}
	}
)
