/**
 * Nightly rankings rebuild
 *
 * Recomputes every ranking at 11pm, after the evening's games, so standings
 * and charts follow the scores without anyone pressing Rebuild. On a night
 * with no new scores it writes what was already there: the output depends
 * only on the games and rosters. Then brings every generated season up to
 * date, whose standings order reads the ratings (docs/SCHEDULING.md).
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'
import {
	isRebuildRunning,
	rebuildRankings,
} from '../../services/playerRankings/rebuild.js'
import { syncAutomaticSeasons } from '../../services/schedule/sync.js'

export const rebuildRankingsNightly = onSchedule(
	{
		schedule: 'every day 23:00',
		timeZone: FIREBASE_CONFIG.TIME_ZONE,
		region: FIREBASE_CONFIG.REGION,
		timeoutSeconds: 540,
		memory: '1GiB',
		maxInstances: 1,
	},
	async (event) => {
		if (await isMigrationInProgress(getFirestore())) {
			logger.info('Skipping rebuildRankingsNightly — migration in progress', {
				scheduleTime: event.scheduleTime,
			})
			return
		}
		if (await isRebuildRunning()) {
			logger.info('Skipping rebuildRankingsNightly — a rebuild is running', {
				scheduleTime: event.scheduleTime,
			})
			return
		}

		const result = await rebuildRankings('schedule')
		if (result.status === 'failed') {
			// Not retried by the scheduler; tomorrow night is the retry. Thrown
			// so the failure shows in the logs.
			throw new Error(
				`Nightly rankings rebuild failed (${result.calculationId})`
			)
		}
		// A generated season's standings order reads the new ratings.
		await syncAutomaticSeasons(getFirestore())
	}
)
