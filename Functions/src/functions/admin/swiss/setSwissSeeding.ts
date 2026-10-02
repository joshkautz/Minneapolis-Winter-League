/**
 * Set Swiss Seeding callable function
 *
 * Writes per-team-season `swissSeed` values to each team's season subdoc.
 *
 * Security validations:
 * - Caller must be an admin
 * - The seeding is a list of distinct team ids, at most one per
 *   registration spot, which also bounds the batch
 * - The season must exist and be Swiss
 * - Every team must take part in the season
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, SeasonDocument, SeasonFormat } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { teamSeasonRef } from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { rethrowAsHttpsError } from '../../../shared/errors.js'
import { REGISTRATION_SPOTS } from '../../../shared/teamPaymentRules.js'

interface SetSwissSeedingRequest {
	seasonId: string
	teamSeeding: string[]
}

interface SetSwissSeedingResponse {
	success: boolean
	message: string
	seasonId: string
	teamsSeeded: number
}

export const setSwissSeeding = onCall<SetSwissSeedingRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { data, auth } = request
		const { seasonId, teamSeeding } = data

		if (!seasonId) {
			throw new HttpsError('invalid-argument', 'Season ID is required')
		}
		if (!teamSeeding || !Array.isArray(teamSeeding)) {
			throw new HttpsError(
				'invalid-argument',
				'Team seeding must be an array of team IDs'
			)
		}
		if (teamSeeding.length === 0) {
			throw new HttpsError('invalid-argument', 'Team seeding cannot be empty')
		}
		if (teamSeeding.length > REGISTRATION_SPOTS) {
			throw new HttpsError(
				'invalid-argument',
				`A season seeds at most ${REGISTRATION_SPOTS} teams.`
			)
		}
		const uniqueTeams = new Set(teamSeeding)
		if (uniqueTeams.size !== teamSeeding.length) {
			throw new HttpsError(
				'invalid-argument',
				'Team seeding cannot contain duplicate team IDs'
			)
		}

		try {
			const firestore = getFirestore()
			await validateAdminUser(auth, firestore)

			const seasonRef = firestore.collection(Collections.SEASONS).doc(seasonId)
			const seasonDoc = await seasonRef.get()
			if (!seasonDoc.exists) {
				throw new HttpsError('not-found', 'Season not found')
			}
			const seasonData = seasonDoc.data() as SeasonDocument
			if (seasonData.format !== SeasonFormat.SWISS) {
				throw new HttpsError(
					'failed-precondition',
					'Season must be in Swiss format to set seeding'
				)
			}

			// Every supplied team must take part in the season; read them all
			// at once, then write each its seed.
			const refs = teamSeeding.map((teamId) =>
				teamSeasonRef(firestore, teamId, seasonId)
			)
			const snaps = await firestore.getAll(...refs)
			const missing = teamSeeding.find((_, i) => !snaps[i].exists)
			if (missing) {
				throw new HttpsError(
					'invalid-argument',
					`Team ${missing} is not participating in this season`
				)
			}
			const batch = firestore.batch()
			refs.forEach((ref, i) => batch.update(ref, { swissSeed: i + 1 }))
			await batch.commit()

			logger.info('Swiss seeding set', {
				seasonId,
				teamsSeeded: teamSeeding.length,
				updatedBy: auth?.uid,
			})

			return {
				success: true,
				message: `Successfully set seeding for ${teamSeeding.length} teams`,
				seasonId,
				teamsSeeded: teamSeeding.length,
			} as SetSwissSeedingResponse
		} catch (error) {
			rethrowAsHttpsError(
				error,
				'The seeding could not be saved. Please try again.',
				{ seasonId, userId: auth?.uid }
			)
		}
	}
)
