import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerRankingDocument } from '../../../types.js'
import { PlayerRatingState } from '../types.js'

/**
 * Converts player ratings map to ranked array with proper tie handling
 */
export function calculatePlayerRankings(
	playerRatings: Map<string, PlayerRatingState>
): PlayerRankingDocument[] {
	const sortedPlayers = Array.from(playerRatings.values()).sort(
		(a, b) => b.currentRating - a.currentRating
	)

	const rankings: PlayerRankingDocument[] = []
	let currentRank = 1

	for (let i = 0; i < sortedPlayers.length; i++) {
		const player = sortedPlayers[i]

		// Check if this player is tied with the previous player
		if (i > 0) {
			const previousPlayer = sortedPlayers[i - 1]
			// Round to 6 decimal places for comparison (matching frontend precision)
			const currentRating = Math.round(player.currentRating * 1000000) / 1000000
			const previousRating =
				Math.round(previousPlayer.currentRating * 1000000) / 1000000

			// If ratings are different, advance the rank by the number of players at the previous rating level
			if (currentRating !== previousRating) {
				// Count how many players had the previous rating
				let playersAtPreviousRank = 1
				for (let j = i - 2; j >= 0; j--) {
					const comparisonRating =
						Math.round(sortedPlayers[j].currentRating * 1000000) / 1000000
					if (comparisonRating === previousRating) {
						playersAtPreviousRank++
					} else {
						break
					}
				}
				currentRank += playersAtPreviousRank
			}
		}

		rankings.push({
			player: null as any, // Will be set when saving to Firestore
			playerId: player.playerId,
			playerName: player.playerName,
			eloRating: player.currentRating,
			totalGames: player.totalGames,
			totalSeasons: player.totalSeasons,
			rank: currentRank,
			lastUpdated: Timestamp.now(),
			lastSeasonId: player.lastSeasonId,
			lastRatingChange: 0, // Will be calculated during updates
		} as PlayerRankingDocument)
	}

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
