/**
 * Get Swiss Rankings callable function
 *
 * Returns current Swiss rankings for a season with full Buchholz breakdown
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	SeasonDocument,
	SeasonFormat,
	GameDocument,
	GameType,
} from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import {
	calculateSwissRankings,
	SwissRanking,
} from '../../../services/swissRankings/index.js'

interface GetSwissRankingsRequest {
	/** Season document ID */
	seasonId: string
}

interface GetSwissRankingsResponse {
	success: boolean
	seasonId: string
	seasonName: string
	format: SeasonFormat
	rankings: SwissRanking[]
	/** Initial seeding if set */
	swissInitialSeeding: string[] | null
	/** Number of games played */
	gamesPlayed: number
	/** Total number of teams */
	totalTeams: number
}

/**
 * Get current Swiss rankings for a season
 *
 * Returns full ranking data including Buchholz breakdown for admin UI
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - Season must exist
 */
export const getSwissRankings = onCall<GetSwissRankingsRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { data, auth } = request
		const { seasonId } = data

		// Validate inputs
		if (!seasonId) {
			throw new HttpsError('invalid-argument', 'Season ID is required')
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

			// Get team IDs from season
			const teamIds = seasonData.teams?.map((teamRef) => teamRef.id) || []

			// Get all regular season games for this season
			const gamesSnapshot = await firestore
				.collection(Collections.GAMES)
				.where('season', '==', seasonRef)
				.where('type', '==', GameType.REGULAR)
				.get()

			const games = gamesSnapshot.docs.map((doc) => doc.data() as GameDocument)

			// Count completed games
			const completedGames = games.filter(
				(game) =>
					game.home &&
					game.away &&
					game.homeScore !== null &&
					game.awayScore !== null
			)

			// Calculate Swiss rankings
			const { rankings } = calculateSwissRankings(games, teamIds)

			logger.info('Swiss rankings retrieved', {
				seasonId,
				seasonName: seasonData.name,
				totalTeams: teamIds.length,
				gamesPlayed: completedGames.length,
				requestedBy: auth?.uid,
			})

			return {
				success: true,
				seasonId,
				seasonName: seasonData.name,
				format: seasonData.format || SeasonFormat.TRADITIONAL,
				rankings,
				swissInitialSeeding: seasonData.swissInitialSeeding || null,
				gamesPlayed: completedGames.length,
				totalTeams: teamIds.length,
			} as GetSwissRankingsResponse
		} catch (error) {
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error getting Swiss rankings:', {
				seasonId,
				userId: auth?.uid,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				`Failed to get Swiss rankings: ${errorMessage}`
			)
		}
	}
)
