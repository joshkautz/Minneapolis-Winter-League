/**
 * Firebase Authentication trigger: an account was deleted.
 *
 * Removes the player's data through `deletePlayerAccountData`, the same
 * cleanup `deletePlayer` runs before it deletes the account. So this does
 * the work for an account deleted from the Firebase console, and finds
 * nothing left to do for one a player deleted from their profile — which is
 * also why a failed run is safe to retry.
 */

import { region } from 'firebase-functions/v1'
import { UserRecord } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { handleFunctionError } from '../../shared/errors.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'
import { deletePlayerAccountData } from '../../services/accountDeletionService.js'

export const userDeleted = region(FIREBASE_CONFIG.REGION)
	// A v1 trigger retries a throw only with this set, as a Gen 2 one does
	// with `retry: true`.
	.runWith({ failurePolicy: true })
	.auth.user()
	.onDelete(async (user: UserRecord) => {
		const { uid } = user

		try {
			const firestore = getFirestore()

			if (await isMigrationInProgress(firestore)) {
				logger.info('Skipping userDeleted — migration in progress', { uid })
				return
			}

			await deletePlayerAccountData(firestore, uid)
		} catch (error) {
			throw handleFunctionError(error, 'userDeleted', { uid })
		}
	})
