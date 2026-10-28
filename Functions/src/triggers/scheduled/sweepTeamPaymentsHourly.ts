/**
 * Hourly settlement sweep
 *
 * Settles every unregistered team holding money, so what comes from time
 * passing happens without anyone doing anything: a team that has not
 * registered when registration closes is refunded, within the hour. It also
 * finishes anything a trigger left undone. See services/teamPaymentsSweep.ts.
 *
 * First it ends any held spots whose week is up (services/heldSpots.ts), so
 * a team that waited for one is registered before settlement looks at it.
 *
 * A failed run is not retried by the scheduler — the next hourly run is the
 * retry — but it throws, so the failure shows in the logs.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'
import { sweepTeamPayments } from '../../services/teamPaymentsSweep.js'
import { releaseHeldSpots } from '../../services/heldSpots.js'

export const sweepTeamPaymentsHourly = onSchedule(
	{
		schedule: 'every 60 minutes',
		timeZone: FIREBASE_CONFIG.TIME_ZONE,
		region: FIREBASE_CONFIG.REGION,
		secrets: ['STRIPE_SECRET_KEY'],
		// Settles teams one after another; refunding a full season can take a
		// while against Stripe, and a cut-off run just finishes next hour.
		timeoutSeconds: 540,
		// One sweep at a time. Overlapping runs would be safe — settlement is
		// idempotent — but they would only duplicate each other's work.
		maxInstances: 1,
	},
	async (event) => {
		if (await isMigrationInProgress(getFirestore())) {
			logger.info('Skipping sweepTeamPaymentsHourly — migration in progress', {
				scheduleTime: event.scheduleTime,
			})
			return
		}

		// A season whose holds could not be released keeps them, and its
		// waiting teams their money, so settlement still runs for the rest.
		const release = await releaseHeldSpots(getFirestore(), new Date())
		const result = await sweepTeamPayments()

		if (release.failures.length > 0) {
			logger.error('Some held spots could not be released', {
				failures: release.failures,
			})
		}
		if (result.failures.length > 0) {
			logger.error('Some teams could not be settled', {
				failures: result.failures,
			})
		}
		if (release.failures.length > 0 || result.failures.length > 0) {
			throw new Error(
				`Held spots failed to release for ${release.failures.length} ` +
					`season(s) and settlement failed for ${result.failures.length} ` +
					`of ${result.teamsChecked} team(s); the next run retries them`
			)
		}
	}
)
