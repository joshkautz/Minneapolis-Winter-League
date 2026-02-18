/**
 * Set Swiss Seeding callable function
 *
 * Sets or updates the initial seeding for a Swiss-format season
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, SeasonDocument, SeasonFormat } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface SetSwissSeedingRequest {
	/** Season document ID */
	seasonId: string
	/** Team IDs in seeding order (index 0 = seed 1) */
	teamSeeding: string[]
}

interface SetSwissSeedingResponse {
	success: boolean
	message: string
	seasonId: string
	teamsSeeded: number
}

/**
 * Set or update initial seeding for a Swiss season
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - Season must exist and be in Swiss format
 * - All team IDs must belong to the season
 */
export const setSwissSeeding = onCall<SetSwissSeedingRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { data, auth } = request
		const { seasonId, teamSeeding } = data

		// Validate inputs
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

		// Check for duplicates
		const uniqueTeams = new Set(teamSeeding)
		if (uniqueTeams.size !== teamSeeding.length) {
			throw new HttpsError(
				'invalid-argument',
				'Team seeding cannot contain duplicate team IDs'
			)
		}

		try {
			const firestore = getFirestore()

			// Validate admin authentication
			await validateAdminUser(auth, firestore)

			// Get the season document
			const seasonRef = firestore.collection(Collections.SEASONS).doc(seasonId)
			const seasonDoc = await seasonRef.get()

			if (!seasonDoc.exists) {
				throw new HttpsError('not-found', 'Season not found')
			}

			const seasonData = seasonDoc.data() as SeasonDocument

			// Verify season is Swiss format
			if (seasonData.format !== SeasonFormat.SWISS) {
				throw new HttpsError(
					'failed-precondition',
					'Season must be in Swiss format to set seeding'
				)
			}

			// Get all team IDs in this season
			const seasonTeamIds = new Set(
				seasonData.teams?.map((teamRef) => teamRef.id) || []
			)

			// Verify all seeding team IDs are valid teams in the season
			for (const teamId of teamSeeding) {
				if (!seasonTeamIds.has(teamId)) {
					throw new HttpsError(
						'invalid-argument',
						`Team ${teamId} is not part of this season`
					)
				}
			}

			// Verify seeding includes ALL teams in the season
			if (teamSeeding.length !== seasonTeamIds.size) {
				throw new HttpsError(
					'invalid-argument',
					`Seeding must include all ${seasonTeamIds.size} teams in the season (received ${teamSeeding.length})`
				)
			}

			// Update the season with the seeding
			await seasonRef.update({
				swissInitialSeeding: teamSeeding,
			})

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
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
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
