/**
 * Create season callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp, WriteBatch } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	PlayerDocument,
	PlayerSeason,
	SeasonDocument,
	TeamDocument,
} from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface CreateSeasonRequest {
	name: string
	dateStart: Date
	dateEnd: Date
	registrationStart: Date
	registrationEnd: Date
	teamIds?: string[] // Optional array of team IDs to add to the season
	stripe?: {
		priceId: string
		priceIdDev?: string
		returningPlayerCouponId?: string
		returningPlayerCouponIdDev?: string
	}
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
			stripe,
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
								firestore
									.collection(Collections.TEAMS)
									.doc(
										teamId
									) as FirebaseFirestore.DocumentReference<TeamDocument>
						)
					: []

			// Build stripe config (only include if at least priceId is provided)
			const stripeConfig = stripe?.priceId
				? {
						priceId: stripe.priceId,
						...(stripe.priceIdDev && { priceIdDev: stripe.priceIdDev }),
						...(stripe.returningPlayerCouponId && {
							returningPlayerCouponId: stripe.returningPlayerCouponId,
						}),
						...(stripe.returningPlayerCouponIdDev && {
							returningPlayerCouponIdDev: stripe.returningPlayerCouponIdDev,
						}),
					}
				: undefined

			// Create the season document
			const seasonData: SeasonDocument = {
				name: name.trim(),
				dateStart: dateStartTimestamp,
				dateEnd: dateEndTimestamp,
				registrationStart: registrationStartTimestamp,
				registrationEnd: registrationEndTimestamp,
				teams: teamReferences,
				...(stripeConfig && { stripe: stripeConfig }),
			}

			const seasonRef = (await firestore
				.collection(Collections.SEASONS)
				.add(seasonData)) as FirebaseFirestore.DocumentReference<SeasonDocument>

			logger.info(`Season created: ${seasonRef.id}`, {
				seasonId: seasonRef.id,
				name: seasonData.name,
				createdBy: auth?.uid,
			})

			// Add this season to all existing players using chunked batches
			const playersSnapshot = await firestore
				.collection(Collections.PLAYERS)
				.get()

			if (playersSnapshot.empty) {
				logger.info('No players found to add season to', {
					seasonId: seasonRef.id,
				})

				return {
					success: true,
					message: `Season "${name}" created successfully (no existing players to update)`,
					seasonId: seasonRef.id,
				} as CreateSeasonResponse
			}

			const BATCH_SIZE = 500 // Firestore batch limit
			let batch: WriteBatch = firestore.batch()
			let operationsInBatch = 0
			let playersUpdated = 0
			let playersSkipped = 0

			for (const playerDoc of playersSnapshot.docs) {
				const playerData = playerDoc.data() as PlayerDocument

				// Check if player already has this season (shouldn't happen, but defensive)
				const hasSeasonAlready = playerData.seasons?.some(
					(ps) => ps.season.id === seasonRef.id
				)

				if (hasSeasonAlready) {
					playersSkipped++
					continue
				}

				// Preserve banned status from the most recent previous season
				let bannedStatus = false
				if (playerData.seasons && playerData.seasons.length > 0) {
					const mostRecentSeason =
						playerData.seasons[playerData.seasons.length - 1]
					bannedStatus = mostRecentSeason.banned || false
				}

				// Create new season data
				const newSeasonData: PlayerSeason = {
					season: seasonRef,
					team: null,
					captain: false,
					paid: false,
					signed: false,
					banned: bannedStatus,
					lookingForTeam: false,
				}

				// Add new season to existing seasons array
				const updatedSeasons = [...(playerData.seasons || []), newSeasonData]
				batch.update(playerDoc.ref, { seasons: updatedSeasons })
				operationsInBatch++
				playersUpdated++

				// Commit batch when it reaches the limit and start a new one
				if (operationsInBatch >= BATCH_SIZE) {
					await batch.commit()
					logger.info(`Committed batch with ${operationsInBatch} player updates`)
					batch = firestore.batch()
					operationsInBatch = 0
				}
			}

			// Commit any remaining operations
			if (operationsInBatch > 0) {
				await batch.commit()
				logger.info(`Committed final batch with ${operationsInBatch} player updates`)
			}

			logger.info(`Season added to players`, {
				seasonId: seasonRef.id,
				playersUpdated,
				playersSkipped,
				totalPlayers: playersSnapshot.size,
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
				userId: auth?.uid,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				`Failed to create season: ${errorMessage}`
			)
		}
	}
)
