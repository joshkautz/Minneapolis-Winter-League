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

			// Discover all teams participating in this season via collection-group
			// query against the per-team season subcollection.
			const teamSeasonsSnapshot = await firestore
				.collectionGroup('seasons')
				.where('season', '==', seasonRef)
				.get()
			const teamSeasonsForSeason = teamSeasonsSnapshot.docs.filter((d) => {
				// Defensive: only keep docs whose parent path is teams/{id}/seasons/{sid}.
				return d.ref.parent.parent?.parent.id === Collections.TEAMS
			})
			const teamIds = teamSeasonsForSeason
				.map((d) => d.ref.parent.parent?.id)
				.filter((id): id is string => !!id)

			// Reconstruct initial seeding (if any) by reading swissSeed from each
			// team-season subdoc.
			const seededEntries = teamSeasonsForSeason
				.map((d) => ({
					teamId: d.ref.parent.parent?.id,
					swissSeed: d.data().swissSeed as number | null | undefined,
				}))
				.filter((e) => typeof e.swissSeed === 'number' && e.teamId)
				.sort((a, b) => (a.swissSeed as number) - (b.swissSeed as number))
			const swissInitialSeeding =
				seededEntries.length > 0
					? seededEntries.map((e) => e.teamId as string)
					: null

			const gamesSnapshot = await firestore
				.collection(Collections.GAMES)
				.where('season', '==', seasonRef)
				.where('type', '==', GameType.REGULAR)
				.get()

			const games = gamesSnapshot.docs.map((doc) => doc.data() as GameDocument)
			const completedGames = games.filter(
				(game) =>
					game.home &&
					game.away &&
					game.homeScore !== null &&
					game.awayScore !== null
			)

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
				swissInitialSeeding,
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
