/**
 * Emergency contacts callable function
 *
 * Lists a season's registered teams with each rostered player's emergency
 * contacts, from the waiver they signed that season, for organizers to
 * have on game day (`services/emergencyContacts.ts`). The contacts are on
 * signature records private to the player and admins, so they are read
 * here rather than by the client, and each read is logged.
 *
 * Security validations:
 * - Caller must be an admin
 * - `seasonId` must be a non-empty string
 * - The season must exist
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { rethrowAsHttpsError } from '../../../shared/errors.js'
import {
	seasonEmergencyContacts,
	type SeasonEmergencyContacts,
} from '../../../services/emergencyContacts.js'

interface GetEmergencyContactsRequest {
	seasonId: string
}

export const getEmergencyContacts = onCall<GetEmergencyContactsRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<SeasonEmergencyContacts> => {
		const firestore = getFirestore()
		const adminId = await validateAdminUser(request.auth, firestore)

		const { seasonId } = request.data ?? {}
		if (typeof seasonId !== 'string' || seasonId.length === 0) {
			throw new HttpsError('invalid-argument', 'Choose a season.')
		}

		let result: SeasonEmergencyContacts | null
		try {
			result = await seasonEmergencyContacts(firestore, seasonId)
		} catch (error) {
			rethrowAsHttpsError(
				error,
				'The emergency contacts could not be loaded. Please try again.',
				{ adminId, seasonId }
			)
		}
		if (!result) {
			throw new HttpsError('not-found', 'That season does not exist.')
		}

		// Personal data leaving the database: keep a record of who read it.
		logger.info('Emergency contacts read', {
			adminId,
			seasonId,
			teams: result.teams.length,
		})
		return result
	}
)
