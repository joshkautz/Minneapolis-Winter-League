/**
 * Add new season to all players callable function
 *
 * This function is only invoked via the Admin Dashboard.
 * It adds a new PlayerSeason object to all PlayerDocuments for a specified season.
 */

import { onCall } from 'firebase-functions/v2/https'
import {
	getFirestore,
	DocumentReference,
	WriteBatch,
} from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	PlayerDocument,
	SeasonDocument,
	PlayerSeason,
} from '../../types.js'
import { validateAuthentication } from '../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'

/**
 * Request interface for adding new season to all players
 */
interface AddNewSeasonToPlayersRequest {
	/** Season ID to add to all players */
	seasonId: string
}

/**
 * Response interface for adding new season to all players
 */
interface AddNewSeasonToPlayersResponse {
	success: boolean
	message: string
	/** Number of players updated */
	playersUpdated: number
	/** Number of players skipped (already had the season) */
	playersSkipped: number
}

/**
 * Adds a new PlayerSeason to all PlayerDocuments for a specified season
 *
 * Security validations performed:
 * - User must be authenticated with verified email
 * - User must have admin privileges
 * - Season must exist and be valid
 * - Only adds new PlayerSeason objects, never overwrites existing ones
 *
 * Features:
 * - Processes all players in batches for performance
 * - Sets captain=false, paid=false, signed=false, team=null for new season
 * - Preserves banned status from most recent previous season
 * - Skips players who already have the season
 * - Uses Firestore batch writes for atomicity
 */
export const addNewSeasonToAllPlayers = onCall<AddNewSeasonToPlayersRequest>(
	{
		cors: [...FIREBASE_CONFIG.CORS_ORIGINS],
		region: FIREBASE_CONFIG.REGION,
		invoker: 'public',
	},
	async (request) => {
		try {
			const { data, auth: authContext } = request

			// Validate authentication and admin privileges
			validateAuthentication(authContext)

			if (!authContext?.uid) {
				throw new Error('Authentication required')
			}

			const userId = authContext.uid
			const firestore = getFirestore()

			// Check if user is admin
			const userDoc = await firestore
				.collection(Collections.PLAYERS)
				.doc(userId)
				.get()

			if (!userDoc.exists || !userDoc.data()?.admin) {
				throw new Error('Insufficient permissions. Admin access required.')
			}

			const { seasonId } = data

			// Validate input
			if (!seasonId || typeof seasonId !== 'string' || seasonId.trim() === '') {
				throw new Error('Season ID is required and must be a non-empty string')
			}

			// Validate that the season exists
			const seasonRef = firestore
				.collection(Collections.SEASONS)
				.doc(seasonId) as DocumentReference<SeasonDocument>

			const seasonDoc = await seasonRef.get()
			if (!seasonDoc.exists) {
				throw new Error('Invalid season ID. Season does not exist.')
			}

			logger.info(`Starting to add season ${seasonId} to all players`, {
				adminUserId: userId,
				seasonId,
			})

			// Get all players
			const playersQuery = await firestore.collection(Collections.PLAYERS).get()

			if (playersQuery.empty) {
				return {
					success: true,
					message: 'No players found to update',
					playersUpdated: 0,
					playersSkipped: 0,
				} as AddNewSeasonToPlayersResponse
			}

			let playersUpdated = 0
			let playersSkipped = 0
			const batchSize = 500 // Firestore batch limit
			let batch: WriteBatch = firestore.batch()
			let operationsInBatch = 0

			for (const playerDoc of playersQuery.docs) {
				const playerData = playerDoc.data() as PlayerDocument
				const playerId = playerDoc.id

				// Check if player already has this season
				const existingSeasonIndex =
					playerData.seasons?.findIndex(
						(season: PlayerSeason) => season.season.id === seasonId
					) ?? -1

				if (existingSeasonIndex >= 0) {
					// Player already has this season, skip
					playersSkipped++
					logger.debug(
						`Skipping player ${playerId}, already has season ${seasonId}`
					)
					continue
				}

				// Determine banned status from most recent previous season
				let bannedStatus = false
				if (playerData.seasons && playerData.seasons.length > 0) {
					// Find the most recent season by getting the season with the latest dateStart
					// Since we can't easily compare dates here, we'll use the last season in the array
					// as seasons are typically added chronologically
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
				}

				// Add new season to existing seasons array
				const updatedSeasons = [...(playerData.seasons || []), newSeasonData]

				// Add update to batch
				batch.update(playerDoc.ref, { seasons: updatedSeasons })
				operationsInBatch++
				playersUpdated++

				// If batch is full, commit it and start a new one
				if (operationsInBatch >= batchSize) {
					await batch.commit()
					logger.info(`Committed batch with ${operationsInBatch} operations`)
					batch = firestore.batch()
					operationsInBatch = 0
				}
			}

			// Commit any remaining operations
			if (operationsInBatch > 0) {
				await batch.commit()
				logger.info(
					`Committed final batch with ${operationsInBatch} operations`
				)
			}

			const message = `Successfully added season ${seasonId} to ${playersUpdated} players. ${playersSkipped} players already had this season.`

			logger.info('Completed adding new season to all players', {
				adminUserId: userId,
				seasonId,
				playersUpdated,
				playersSkipped,
				totalPlayers: playersQuery.size,
			})

			return {
				success: true,
				message,
				playersUpdated,
				playersSkipped,
			} as AddNewSeasonToPlayersResponse
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: 'Failed to add new season to all players'

			logger.error('Error adding new season to all players', {
				error: errorMessage,
				data: request.data,
			})

			return {
				success: false,
				message: errorMessage,
				playersUpdated: 0,
				playersSkipped: 0,
			} as AddNewSeasonToPlayersResponse
		}
	}
)
