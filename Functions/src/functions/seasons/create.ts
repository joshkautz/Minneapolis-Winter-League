/**
 * Create season callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerDocument, SeasonDocument } from '../../types.js'
import { validateAdminUser } from '../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'

interface CreateSeasonRequest {
	name: string
	dateStart: Date
	dateEnd: Date
	registrationStart: Date
	registrationEnd: Date
	teamIds?: string[] // Optional array of team IDs to add to the season
}

interface CreateSeasonResponse {
	success: boolean
	message: string
	seasonId?: string
}

/**
 * Creates a new season with proper authorization and validation
 * Automatically adds the season to all existing players
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - Season name must be 3-100 characters
 * - All date fields are required
 */
export const createSeason = onCall<CreateSeasonRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { data, auth } = request

		const {
			name,
			dateStart,
			dateEnd,
			registrationStart,
			registrationEnd,
			teamIds,
		} = data

		// Validate inputs
		if (
			!name ||
			!dateStart ||
			!dateEnd ||
			!registrationStart ||
			!registrationEnd
		) {
			throw new HttpsError(
				'invalid-argument',
				'Season name and all date fields are required'
			)
		}

		// Validate season name length
		if (name.length < 3 || name.length > 100) {
			throw new HttpsError(
				'invalid-argument',
				'Season name must be between 3 and 100 characters'
			)
		}

		try {
			const firestore = getFirestore()

			// Validate admin authentication
			await validateAdminUser(auth, firestore)

			// Convert dates to Timestamps
			const dateStartTimestamp = Timestamp.fromDate(new Date(dateStart))
			const dateEndTimestamp = Timestamp.fromDate(new Date(dateEnd))
			const registrationStartTimestamp = Timestamp.fromDate(
				new Date(registrationStart)
			)
			const registrationEndTimestamp = Timestamp.fromDate(
				new Date(registrationEnd)
			)

			// Build team references array
			const teamReferences =
				teamIds && teamIds.length > 0
					? teamIds.map(
							(teamId) =>
								firestore.collection(Collections.TEAMS).doc(teamId) as any
						)
					: []

			// Create the season document
			const seasonData: SeasonDocument = {
				name: name.trim(),
				dateStart: dateStartTimestamp,
				dateEnd: dateEndTimestamp,
				registrationStart: registrationStartTimestamp,
				registrationEnd: registrationEndTimestamp,
				teams: teamReferences,
			}

			const seasonRef = await firestore
				.collection(Collections.SEASONS)
				.add(seasonData)

			logger.info(`Season created: ${seasonRef.id}`, {
				seasonId: seasonRef.id,
				name: seasonData.name,
				createdBy: auth!.uid,
			})

			// Add this season to all existing players
			const playersSnapshot = await firestore
				.collection(Collections.PLAYERS)
				.get()

			const batch = firestore.batch()
			let playersUpdated = 0

			for (const playerDoc of playersSnapshot.docs) {
				const playerData = playerDoc.data() as PlayerDocument

				// Check if player already has this season (shouldn't happen, but just in case)
				const hasSeasonAlready = playerData.seasons?.some(
					(ps) => ps.season.id === seasonRef.id
				)

				if (!hasSeasonAlready) {
					// Add the season to the player's seasons array
					batch.update(playerDoc.ref, {
						seasons: FieldValue.arrayUnion({
							banned: false,
							captain: false,
							paid: false,
							season: seasonRef,
							signed: false,
							team: null,
							lookingForTeam: false,
						}),
					})
					playersUpdated++
				}
			}

			// Commit the batch update
			await batch.commit()

			logger.info(`Season added to ${playersUpdated} players`, {
				seasonId: seasonRef.id,
				playersUpdated,
			})

			return {
				success: true,
				message: `Season "${name}" created successfully and added to ${playersUpdated} players`,
				seasonId: seasonRef.id,
			} as CreateSeasonResponse
		} catch (error) {
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error creating season:', {
				name,
				userId: auth!.uid,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				`Failed to create season: ${errorMessage}`
			)
		}
	}
)
