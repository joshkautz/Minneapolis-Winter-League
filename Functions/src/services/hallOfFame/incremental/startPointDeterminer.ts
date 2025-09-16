import { getFirestore } from 'firebase-admin/firestore'
import { Collections, RankingHistoryDocument } from '../../../types.js'
import { IncrementalStartPoint } from '../types.js'
import { convertSnapshotToRatings } from './snapshotConverter.js'

/**
 * Determines the starting point for incremental calculations
 */
export async function determineIncrementalStartPoint(
	startSeasonId?: string,
	startWeek?: number
): Promise<IncrementalStartPoint> {
	const firestore = getFirestore()

	// If no specific starting point, find the last completed snapshot
	if (!startSeasonId) {
		const lastSnapshotQuery = await firestore
			.collection(Collections.RANKING_HISTORY)
			.orderBy('snapshotDate', 'desc')
			.limit(1)
			.get()

		if (lastSnapshotQuery.empty) {
			// No previous snapshots, start from beginning
			return {
				seasonIndex: 0,
				week: 1,
				playerRatings: new Map(),
			}
		}

		const lastSnapshot =
			lastSnapshotQuery.docs[0].data() as RankingHistoryDocument
		// Get season index and convert snapshot to player ratings
		const seasonDoc = await lastSnapshot.season.get()
		const seasonsSnapshot = await firestore
			.collection(Collections.SEASONS)
			.orderBy('dateStart', 'asc')
			.get()

		const seasonIndex = seasonsSnapshot.docs.findIndex(
			(doc) => doc.id === seasonDoc.id
		)
		const playerRatings = convertSnapshotToRatings(lastSnapshot.rankings)

		return {
			seasonIndex: seasonIndex >= 0 ? seasonIndex : 0,
			week: lastSnapshot.week,
			playerRatings,
		}
	}

	// TODO: Implement specific season/week starting point
	return {
		seasonIndex: 0,
		week: startWeek || 1,
		playerRatings: new Map(),
	}
}
