/**
 * Set Swiss Seeding callable function
 *
 * Writes per-team-season `swissSeed` values to each team's season subdoc.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, SeasonDocument, SeasonFormat } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { teamSeasonRef } from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

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
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
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

			// Validate every supplied team has a season subdoc for this season,
			// then write the seed value to that subdoc.
			const batch = firestore.batch()
			for (let i = 0; i < teamSeeding.length; i++) {
				const tid = teamSeeding[i]
				const tsRef = teamSeasonRef(firestore, tid, seasonId)
				const snap = await tsRef.get()
				if (!snap.exists) {
					throw new HttpsError(
						'invalid-argument',
						`Team ${tid} is not participating in this season`
					)
				}
				batch.update(tsRef, { swissSeed: i + 1 })
			}
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
			if (error instanceof HttpsError) throw error
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'
			logger.error('Error setting Swiss seeding:', {
				seasonId,
				userId: auth?.uid,
				error: errorMessage,
			})
			throw new HttpsError(
				'internal',
				`Failed to set Swiss seeding: ${errorMessage}`
			)
		}
	}
)
