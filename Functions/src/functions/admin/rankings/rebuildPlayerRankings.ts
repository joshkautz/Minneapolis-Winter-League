/**
 * Rebuild player rankings callable function
 *
 * Recomputes every ranking from every completed game: the all-time
 * leaderboard, each player's history and each season's standings. The same
 * rebuild runs every night on its own (`triggers/scheduled/
 * rebuildRankingsNightly.ts`); this is the button for running it now.
 *
 * Security validations:
 * - Caller must be an admin
 * - Refused while another rebuild is running, so two never interleave writes
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import {
	isRebuildRunning,
	rebuildRankings,
	type RebuildResult,
} from '../../../services/playerRankings/rebuild.js'

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

		return await rebuildRankings(adminId)
	}
)
