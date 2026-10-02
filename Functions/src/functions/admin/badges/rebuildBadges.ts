/**
 * Rebuild badges callable function
 *
 * Awards every badge from the league's data, making the stored awards match
 * what the rules produce (see `services/badges/rebuild.ts`). The same rebuild
 * runs every night on its own (`triggers/scheduled/awardBadgesNightly.ts`);
 * this is the button for running it now, and with `dryRun` for seeing what
 * it would change.
 *
 * Security validations:
 * - Caller must be an admin
 * - `dryRun`, when given, must be a boolean
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { rethrowAsHttpsError } from '../../../shared/errors.js'
import {
	rebuildBadges as rebuild,
	type BadgesSummary,
} from '../../../services/badges/rebuild.js'

interface RebuildBadgesRequest {
	/** Report what would change without writing it. */
	dryRun?: boolean
}

export const rebuildBadges = onCall<RebuildBadgesRequest>(
	{
		region: FIREBASE_CONFIG.REGION,
		timeoutSeconds: 540,
		memory: '1GiB',
	},
	async (request): Promise<BadgesSummary> => {
		const firestore = getFirestore()
		const adminId = await validateAdminUser(request.auth, firestore)

		const dryRun = request.data?.dryRun ?? false
		if (typeof dryRun !== 'boolean') {
			throw new HttpsError('invalid-argument', 'dryRun must be true or false.')
		}

		try {
			return await rebuild(firestore, { dryRun })
		} catch (error) {
			rethrowAsHttpsError(
				error,
				'The badges could not be rebuilt. Please try again.',
				{ adminId, dryRun }
			)
		}
	}
)
