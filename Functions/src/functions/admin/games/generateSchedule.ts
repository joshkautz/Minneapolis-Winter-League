/**
 * Generate schedule callable function
 *
 * Creates every regular-season game of a traditional season from the
 * league's schedule tables (`services/schedule/`), and turns on its
 * automatic playoffs: pool night, championship night and the placements
 * then follow from the scores. With `dryRun`, returns the games without
 * creating them, for the admin to review.
 *
 * Security validations:
 * - Caller must be an admin
 * - `seasonId` must be a non-empty string; `dryRun`, when given, a boolean
 * - The season must exist, be traditional, have exactly twelve registered
 *   teams, a number of game nights there is a table for, and no games yet
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { rethrowAsHttpsError } from '../../../shared/errors.js'
import {
	generateRegularSeason,
	type GeneratedSchedule,
} from '../../../services/schedule/sync.js'

interface GenerateScheduleRequest {
	seasonId: string
	/** Return the games without creating them. */
	dryRun?: boolean
}

export const generateSchedule = onCall<GenerateScheduleRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<GeneratedSchedule> => {
		const firestore = getFirestore()
		const adminId = await validateAdminUser(request.auth, firestore)

		const { seasonId, dryRun = false } = request.data ?? {}
		if (typeof seasonId !== 'string' || seasonId.length === 0) {
			throw new HttpsError('invalid-argument', 'Choose a season to schedule.')
		}
		if (typeof dryRun !== 'boolean') {
			throw new HttpsError('invalid-argument', 'dryRun must be true or false.')
		}

		try {
			return await generateRegularSeason(firestore, seasonId, { dryRun })
		} catch (error) {
			rethrowAsHttpsError(
				error,
				'The schedule could not be generated. Please try again.',
				{ adminId, seasonId, dryRun }
			)
		}
	}
)
