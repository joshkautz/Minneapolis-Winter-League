import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerRankingDocument } from '../../../types.js'
import { PlayerRatingState } from '../types.js'

/**
 * Converts player ratings map to ranked array
 */
export function calculatePlayerRankings(
	playerRatings: Map<string, PlayerRatingState>
): PlayerRankingDocument[] {
	const rankings = Array.from(playerRatings.values())
		.sort((a, b) => b.currentRating - a.currentRating)
		.map(
			(playerState, index) =>
				({
					player: null as any, // Will be set when saving to Firestore
					playerId: playerState.playerId,
					playerName: playerState.playerName,
					eloRating: playerState.currentRating,
					totalGames: playerState.totalGames,
					totalSeasons: playerState.totalSeasons,
					rank: index + 1,
					lastUpdated: Timestamp.now(),
					lastSeasonId: playerState.lastSeasonId,
					lastRatingChange: 0, // Will be calculated during updates
					isActive: playerState.isActive,
				}) as PlayerRankingDocument
		)

	return rankings
}

/**
 * Saves final player rankings to Firestore
 */
export async function saveFinalRankings(
	playerRatings: Map<string, PlayerRatingState>
): Promise<void> {
	const firestore = getFirestore()
	const rankings = calculatePlayerRankings(playerRatings)

	// Use batch writes to update all rankings efficiently
	const batch = firestore.batch()

	for (const ranking of rankings) {
		// Create a clean ranking document without circular references
		const rankingDoc = {
			...ranking,
			// Remove the player reference that was causing issues
			player: firestore.collection(Collections.PLAYERS).doc(ranking.playerId),
		}

		// Use the actual player ID for the document ID
		const rankingRef = firestore
			.collection(Collections.RANKINGS)
			.doc(ranking.playerId)

		batch.set(rankingRef, rankingDoc)
	}

	await batch.commit()
	logger.info(`Saved ${rankings.length} player rankings to Firestore`)
}
