import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerRankingDocument } from '../../../types.js'
import { PlayerRatingState } from '../types.js'
import { calculateRanksWithTieHandling } from '../utils/rankCalculator.js'

/**
 * Loads previous rankings to calculate rating changes
 */
async function loadPreviousRankings(): Promise<Map<string, number>> {
	const firestore = getFirestore()
	const previousRatings = new Map<string, number>()

	const rankingsSnapshot = await firestore
		.collection(Collections.RANKINGS)
		.get()

	for (const doc of rankingsSnapshot.docs) {
		const data = doc.data() as PlayerRankingDocument
		previousRatings.set(doc.id, data.rating)
	}

	return previousRatings
}

/**
 * Converts player ratings map to ranked array with proper tie handling
 * Uses TrueSkill mu (skill estimate) for ranking.
 *
 * The returned objects are missing the `player` ref field (added later in
 * `saveFinalRankings`) and use `FieldValue.serverTimestamp()` for
 * `lastUpdated` (resolved to a `Timestamp` server-side at write time), so
 * the return type is loosened with a structural type rather than the
 * strict `PlayerRankingDocument`.
 */
export function calculatePlayerRankings(
	playerRatings: Map<string, PlayerRatingState>,
	previousRatings: Map<string, number>
): Array<
	Omit<PlayerRankingDocument, 'player' | 'lastUpdated'> & {
		lastUpdated: FieldValue
	}
> {
	const rankedPlayers = calculateRanksWithTieHandling(playerRatings)

	return rankedPlayers.map(({ player, rank }) => {
		// Calculate rating change from previous rankings
		const previousRating = previousRatings.get(player.playerId)
		const lastRatingChange = previousRating ? player.mu - previousRating : 0

		// Note: player reference is set in saveFinalRankings when creating the
		// batch. `lastUpdated` is a server-timestamp sentinel that Firestore
		// resolves to a Timestamp on commit.
		return {
			playerId: player.playerId,
			playerName: player.playerName,
			rating: player.mu, // TrueSkill μ (skill estimate)
			totalGames: player.totalGames,
			totalSeasons: player.totalSeasons,
			rank,
			lastUpdated: FieldValue.serverTimestamp(),
			lastSeasonId: player.lastSeasonId,
			lastRatingChange,
		}
	})
}

/**
 * Saves final player rankings to Firestore
 */
export async function saveFinalRankings(
	playerRatings: Map<string, PlayerRatingState>
): Promise<void> {
	const firestore = getFirestore()

	// Load previous rankings for calculating rating changes
	const previousRatings = await loadPreviousRankings()

	const rankings = calculatePlayerRankings(playerRatings, previousRatings)

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
