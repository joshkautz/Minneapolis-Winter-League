import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerRankingDocument } from '../../../types.js'
import { PlayerRatingState } from '../types.js'

/**
 * Loads existing player rankings from Firestore and converts them to PlayerRatingState format
 * This is essential for incremental calculations to preserve existing totals
 */
export async function loadExistingRankings(): Promise<
	Map<string, PlayerRatingState>
> {
	const firestore = getFirestore()
	const playerRatings = new Map<string, PlayerRatingState>()

	try {
		// Load all existing rankings from the rankings collection
		const rankingsSnapshot = await firestore
			.collection(Collections.RANKINGS)
			.get()

		logger.info(
			`Loading ${rankingsSnapshot.size} existing player rankings for incremental update`
		)

		for (const doc of rankingsSnapshot.docs) {
			const ranking = doc.data() as PlayerRankingDocument

			// Convert PlayerRankingDocument to PlayerRatingState
			const playerState: PlayerRatingState = {
				playerId: ranking.playerId,
				playerName: ranking.playerName,
				currentRating: ranking.eloRating,
				totalGames: ranking.totalGames, // This is the key - preserve existing totalGames
				totalSeasons: ranking.totalSeasons,
				seasonsPlayed: new Set(), // Will be populated as we process games
				lastSeasonId: ranking.lastSeasonId,
				lastGameDate: null, // Initialize for round-based decay tracking
				roundsSinceLastGame: 0, // Start fresh for round tracking
			}

			// Reconstruct seasonsPlayed Set from totalSeasons
			// Note: We can't perfectly reconstruct which specific seasons were played
			// from just totalSeasons, but this will be corrected as we process new games
			// The important part is preserving totalGames and totalSeasons counts

			playerRatings.set(ranking.playerId, playerState)
		}

		logger.info(
			`Successfully loaded ${playerRatings.size} existing player rankings`
		)
		return playerRatings
	} catch (error) {
		logger.error(
			'Failed to load existing rankings for incremental update:',
			error
		)
		// Return empty map on error - this will cause the function to work like a full rebuild
		// which is safer than failing the entire calculation
		return new Map<string, PlayerRatingState>()
	}
}

/**
 * Checks if there are any existing rankings in the database
 * This can be used to determine if we need to load existing data or start fresh
 */
export async function hasExistingRankings(): Promise<boolean> {
	const firestore = getFirestore()

	try {
		const rankingsSnapshot = await firestore
			.collection(Collections.RANKINGS)
			.limit(1)
			.get()

		return !rankingsSnapshot.empty
	} catch (error) {
		logger.error('Failed to check for existing rankings:', error)
		return false
	}
}
