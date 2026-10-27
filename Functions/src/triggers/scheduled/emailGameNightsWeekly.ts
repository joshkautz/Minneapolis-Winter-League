/**
 * Weekly game-night email
 *
 * Every Thursday at noon, emails each rostered player on a team with games
 * that Saturday: the games, where the team stands and what the night
 * decides (`email/gameNightEmails.ts`). In a week with no game night it
 * does nothing. Each player's email has a stable id, so a rerun sends
 * nothing twice.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'
import { queueGameNightEmails } from '../../email/gameNightEmails.js'

export const emailGameNightsWeekly = onSchedule(
	{
		schedule: 'every thursday 12:00',
		timeZone: FIREBASE_CONFIG.TIME_ZONE,
		region: FIREBASE_CONFIG.REGION,
		timeoutSeconds: 300,
		maxInstances: 1,
	},
	async (event) => {
		const firestore = getFirestore()
		if (await isMigrationInProgress(firestore)) {
			logger.info('Skipping emailGameNightsWeekly — migration in progress', {
				scheduleTime: event.scheduleTime,
			})
			return
		}
		// A failed run is not retried by the scheduler. Let it throw, so the
		// failure shows in the logs; an admin can rerun the job from Cloud
		// Scheduler, and the stable ids keep a rerun from emailing anyone twice.
		const summary = await queueGameNightEmails(firestore, {
			now: new Date(event.scheduleTime),
		})
		logger.info('Game-night emails queued', summary)
	}
)
