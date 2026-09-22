import {
	getFirestore,
	FieldValue,
	type WriteBatch,
} from 'firebase-admin/firestore'
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
 * Firestore caps a write batch at 500 operations. A rebuild writes one
 * document per player and deletes the leftovers, so a large enough league
 * would silently exceed a single batch.
 */
const MAX_BATCH_OPERATIONS = 500

/**
 * Saves final player rankings to Firestore.
 *
 * Rankings are a pure projection of the games in the database: a rebuild
 * processes every season, so a player only drops out of the result when they
 * are no longer on the roster of any game that was ever played. Documents for
 * those players are deleted rather than left behind — a stale document keeps
 * its old rating and its old rank, and since ranks are only computed over the
 * rebuilt set, it can still outrank current players in a raw read of the
 * collection.
 */
export async function saveFinalRankings(
	playerRatings: Map<string, PlayerRatingState>
): Promise<void> {
	const firestore = getFirestore()

	// Load previous rankings for calculating rating changes
	const previousRatings = await loadPreviousRankings()

	const rankings = calculatePlayerRankings(playerRatings, previousRatings)
	const rankedPlayerIds = new Set(rankings.map((ranking) => ranking.playerId))

	const staleRankingIds = [...previousRatings.keys()].filter(
		(playerId) => !rankedPlayerIds.has(playerId)
	)

	const operations: ((batch: WriteBatch) => void)[] = [
		...rankings.map((ranking) => (batch: WriteBatch) => {
			batch.set(
				firestore.collection(Collections.RANKINGS).doc(ranking.playerId),
				{
					...ranking,
					player: firestore
						.collection(Collections.PLAYERS)
						.doc(ranking.playerId),
				}
			)
		}),
		...staleRankingIds.map((playerId) => (batch: WriteBatch) => {
			batch.delete(firestore.collection(Collections.RANKINGS).doc(playerId))
		}),
	]

	for (let i = 0; i < operations.length; i += MAX_BATCH_OPERATIONS) {
		const batch = firestore.batch()
		for (const operation of operations.slice(i, i + MAX_BATCH_OPERATIONS)) {
			operation(batch)
		}
		await batch.commit()
	}

	logger.info(`Saved ${rankings.length} player rankings to Firestore`, {
		removed: staleRankingIds.length,
	})
}
