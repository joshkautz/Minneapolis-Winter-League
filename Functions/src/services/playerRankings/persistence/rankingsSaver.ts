/**
 * Saves a rebuild: the all-time leaderboard, each player's history and each
 * season's standings.
 *
 * Rankings are a pure projection of the games in the database, so anything
 * a rebuild no longer produces is deleted rather than left behind — a stale
 * leaderboard entry keeps its old rank and can outrank current players.
 *
 * Writes go through a BulkWriter: their number grows with the league and
 * each history grows every round, so a WriteBatch would eventually exceed
 * both its 500-operation and its 10 MiB request limits.
 */

import {
	FieldValue,
	Timestamp,
	type CollectionReference,
	type DocumentData,
	type DocumentReference,
	type Firestore,
} from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, SEASON_RANKINGS_SUBCOLLECTION } from '../../../types.js'
import type { RankingProjections } from '../engine/projections.js'

interface SaveParams {
	projections: RankingProjections
	playerNames: ReadonlyMap<string, string>
	/** Every season, so one whose games are all gone is cleared too. */
	seasonIds: string[]
	calculationId: string
}

interface Writer {
	set(ref: DocumentReference, data: DocumentData): void
	delete(ref: DocumentReference): void
	/** Flushes every write, throwing if any failed. */
	finish(): Promise<void>
}

/**
 * A BulkWriter whose failures are not lost: `close()` resolves even when
 * writes failed, so each write's promise is kept and checked afterwards.
 */
function trackedWriter(firestore: Firestore): Writer {
	const writer = firestore.bulkWriter()
	const writes: Promise<unknown>[] = []
	return {
		set: (ref, data) => void writes.push(writer.set(ref, data)),
		delete: (ref) => void writes.push(writer.delete(ref)),
		finish: async (): Promise<void> => {
			await writer.close()
			const failed = (await Promise.allSettled(writes)).filter(
				(result): result is PromiseRejectedResult =>
					result.status === 'rejected'
			)
			if (failed.length > 0) {
				throw new Error(
					`${failed.length} of ${writes.length} rankings writes failed: ${String(failed[0].reason)}`
				)
			}
		},
	}
}

/** Deletes every document in `collection` whose id is not in `keep`. */
async function deleteAllBut(
	writer: Writer,
	collection: CollectionReference,
	keep: ReadonlySet<string>
): Promise<number> {
	const existing = await collection.listDocuments()
	const stale = existing.filter((doc) => !keep.has(doc.id))
	for (const doc of stale) writer.delete(doc)
	return stale.length
}

export async function saveRankings(
	firestore: Firestore,
	params: SaveParams
): Promise<void> {
	const { projections, playerNames, calculationId } = params
	const writer = trackedWriter(firestore)
	const lastUpdated = FieldValue.serverTimestamp()
	const nameOf = (playerId: string): string => playerNames.get(playerId) ?? ''
	const playerRef = (playerId: string): DocumentReference =>
		firestore.collection(Collections.PLAYERS).doc(playerId)

	// ---- All-time leaderboard ------------------------------------------------
	const rankings = firestore.collection(Collections.RANKINGS)
	for (const ranking of projections.final) {
		writer.set(rankings.doc(ranking.playerId), {
			...ranking,
			playerName: nameOf(ranking.playerId),
			player: playerRef(ranking.playerId),
			lastUpdated,
		})
	}
	const removedRankings = await deleteAllBut(
		writer,
		rankings,
		new Set(projections.final.map((ranking) => ranking.playerId))
	)

	// ---- Each player's history -----------------------------------------------
	const histories = firestore.collection(Collections.PLAYER_RANKING_HISTORY)
	for (const [playerId, points] of projections.histories) {
		writer.set(histories.doc(playerId), {
			player: playerRef(playerId),
			playerId,
			playerName: nameOf(playerId),
			rounds: points.map((point) => ({
				...point,
				date: Timestamp.fromDate(point.date),
			})),
			calculationId,
			lastUpdated,
		})
	}
	await deleteAllBut(writer, histories, new Set(projections.histories.keys()))

	// ---- Each season's standings ---------------------------------------------
	for (const seasonId of params.seasonIds) {
		const standingsRef = firestore
			.collection(Collections.SEASONS)
			.doc(seasonId)
			.collection(SEASON_RANKINGS_SUBCOLLECTION)
		const standings = projections.seasons.get(seasonId) ?? []
		for (const standing of standings) {
			writer.set(standingsRef.doc(standing.playerId), {
				...standing,
				playerName: nameOf(standing.playerId),
				player: playerRef(standing.playerId),
				calculationId,
				lastUpdated,
			})
		}
		await deleteAllBut(
			writer,
			standingsRef,
			new Set(standings.map((standing) => standing.playerId))
		)
	}

	await writer.finish()
	logger.info(`Saved rankings for ${projections.final.length} players`, {
		removed: removedRankings,
		seasons: projections.seasons.size,
	})
}

