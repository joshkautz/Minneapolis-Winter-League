/**
 * Nightly badges rebuild
 *
 * Awards every badge at 11:30pm, after the evening's games and the 11pm
 * rankings rebuild, whose season standings and ratings Rising Stars and
 * Celebrity read. On a night with nothing new it changes nothing: every
 * award is a projection of the league's data.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'
import { rebuildBadges } from '../../services/badges/rebuild.js'

export const awardBadgesNightly = onSchedule(
	{
		schedule: 'every day 23:30',
		timeZone: FIREBASE_CONFIG.TIME_ZONE,
		region: FIREBASE_CONFIG.REGION,
		timeoutSeconds: 540,
		memory: '1GiB',
		maxInstances: 1,
	},
	async (event) => {
		const firestore = getFirestore()
		if (await isMigrationInProgress(firestore)) {
			logger.info('Skipping awardBadgesNightly — migration in progress', {
				scheduleTime: event.scheduleTime,
			})
			return
		}
		// A failed run is not retried by the scheduler; tomorrow night is the
		// retry. Let it throw, so the failure shows in the logs.
		await rebuildBadges(firestore, { now: new Date(event.scheduleTime) })
	}
)
