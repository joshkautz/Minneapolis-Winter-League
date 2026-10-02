/**
 * Update playoffs callable function
 *
 * Brings a generated season's playoffs up to date with its scores now:
 * the pool and championship games the results decide, and the placements
 * once they are final (`services/schedule/sync.ts`). The same update runs
 * on its own whenever a game changes (`updatePlayoffsOnGameChange`); this
 * is the button for running it by hand, and with `dryRun` for seeing what
 * it would do.
 *
 * Security validations:
 * - Caller must be an admin
 * - `seasonId` must be a non-empty string; `dryRun`, when given, a boolean
 * - The season must exist and have had its schedule generated
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { rethrowAsHttpsError } from '../../../shared/errors.js'
import {
	updatePlayoffs as update,
	type PlayoffsSummary,
} from '../../../services/schedule/sync.js'

interface UpdatePlayoffsRequest {
	seasonId: string
	/** Report what would change without writing it. */
	dryRun?: boolean
}

export const updatePlayoffs = onCall<UpdatePlayoffsRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<PlayoffsSummary> => {
		const firestore = getFirestore()
		const adminId = await validateAdminUser(request.auth, firestore)

		const { seasonId, dryRun = false } = request.data ?? {}
		if (typeof seasonId !== 'string' || seasonId.length === 0) {
			throw new HttpsError('invalid-argument', 'Choose a season.')
		}
		if (typeof dryRun !== 'boolean') {
			throw new HttpsError('invalid-argument', 'dryRun must be true or false.')
		}

		try {
			return await update(firestore, seasonId, { dryRun })
		} catch (error) {
			rethrowAsHttpsError(
				error,
				'The playoffs could not be updated. Please try again.',
				{ adminId, seasonId, dryRun }
			)
		}
	}
)
