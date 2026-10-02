/**
 * Rebuild player rankings callable function
 *
 * Recomputes every ranking from every completed game: the all-time
 * leaderboard, each player's history and each season's standings. The same
 * rebuild runs every night on its own (`triggers/scheduled/
 * rebuildRankingsNightly.ts`); this is the button for running it now.
 * Afterwards it updates every generated season, whose standings order reads
 * the ratings.
 *
 * Security validations:
 * - Caller must be an admin
 * - Refused while another rebuild is running, so two never interleave writes
 */

import { logger } from 'firebase-functions/v2'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import {
	isRebuildRunning,
	rebuildRankings,
	type RebuildResult,
} from '../../../services/playerRankings/rebuild.js'
import { syncAutomaticSeasons } from '../../../services/schedule/sync.js'

export const rebuildPlayerRankings = onCall(
	{
		region: FIREBASE_CONFIG.REGION,
		timeoutSeconds: 540,
		memory: '1GiB',
	},
	async (request): Promise<RebuildResult> => {
		const adminId = await validateAdminUser(request.auth, getFirestore())

		if (await isRebuildRunning()) {
			throw new HttpsError(
				'failed-precondition',
				'A rankings rebuild is already running. Wait for it to finish, then try again.'
			)
		}

		const result = await rebuildRankings(adminId)
		if (result.status !== 'failed') {
			// A generated season's standings order reads the new ratings. The
			// rankings are rebuilt either way, so a failure here is logged,
			// and the next game write or nightly rebuild catches up.
			try {
				await syncAutomaticSeasons(getFirestore())
			} catch (error) {
				logger.error('Generated seasons not updated after a rebuild', {
					adminId,
					error: error instanceof Error ? error.message : String(error),
				})
			}
		}
		return result
	}
)
