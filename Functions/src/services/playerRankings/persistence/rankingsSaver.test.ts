import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Batch chunking, which no emulator test can cover: the Firestore emulator
 * happily commits a batch of any size, while real Firestore rejects anything
 * over 500 operations. A rebuild writes one document per player and deletes
 * every leftover, so a large enough league would fail in production and pass
 * everywhere else. Counting commits against a fake Firestore is the only
 * place that discrepancy shows up.
 */

const commit = vi.fn()
const batches: { sets: number; deletes: number }[] = []

const makeBatch = () => {
	const counts = { sets: 0, deletes: 0 }
	batches.push(counts)
	return {
		set: () => {
			counts.sets++
		},
		delete: () => {
			counts.deletes++
		},
		commit,
	}
}

const existingRankingIds: string[] = []

const firestore = {
	batch: makeBatch,
	collection: (name: string) => ({
		doc: (id: string) => ({ path: `${name}/${id}` }),
		get: async () => ({
			docs: existingRankingIds.map((id) => ({
				id,
				data: () => ({ rating: 25 }),
			})),
		}),
	}),
}

vi.mock('firebase-admin/firestore', () => ({
	getFirestore: () => firestore,
	FieldValue: { serverTimestamp: () => 'ts' },
}))

vi.mock('firebase-functions/v2', () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { saveFinalRankings } = await import('./rankingsSaver.js')

/** Builds a ratings map of `count` players, all distinct. */
const ratingsFor = (count: number) =>
	new Map(
		Array.from({ length: count }, (_, i) => [
			`player-${i}`,
			{
				playerId: `player-${i}`,
				playerName: `Player ${i}`,
				mu: 25 + i,
				sigma: 8.333,
				totalGames: 1,
				totalSeasons: 1,
				seasonsPlayed: new Set(['season-1']),
				lastSeasonId: 'season-1',
				lastGameDate: null,
				roundsSinceLastGame: 0,
			},
		])
	)

const totals = () => ({
	sets: batches.reduce((sum, b) => sum + b.sets, 0),
	deletes: batches.reduce((sum, b) => sum + b.deletes, 0),
})

beforeEach(() => {
	vi.clearAllMocks()
	batches.length = 0
	existingRankingIds.length = 0
})

describe('saveFinalRankings batching', () => {
	it('commits a single batch when the whole league fits in one', async () => {
		await saveFinalRankings(ratingsFor(10))

		expect(commit).toHaveBeenCalledTimes(1)
		expect(totals().sets).toBe(10)
	})

	it('never exceeds 500 operations in a batch', async () => {
		await saveFinalRankings(ratingsFor(1200))

		expect(commit).toHaveBeenCalledTimes(3)
		for (const batch of batches) {
			expect(batch.sets + batch.deletes).toBeLessThanOrEqual(500)
		}
		expect(totals().sets).toBe(1200)
	})

	it('counts deletions toward the batch limit too', async () => {
		// The failure this guards against: 400 writes plus 400 deletions is
		// 800 operations, well within the limit on either count alone.
		existingRankingIds.push(
			...Array.from({ length: 400 }, (_, i) => `retired-${i}`)
		)

		await saveFinalRankings(ratingsFor(400))

		for (const batch of batches) {
			expect(batch.sets + batch.deletes).toBeLessThanOrEqual(500)
		}
		expect(totals()).toEqual({ sets: 400, deletes: 400 })
	})

	it('deletes only the players missing from the rebuild', async () => {
		existingRankingIds.push('player-0', 'player-1', 'retired')

		await saveFinalRankings(ratingsFor(2))

		expect(totals()).toEqual({ sets: 2, deletes: 1 })
	})

	it('commits nothing when there is nothing to write or remove', async () => {
		await saveFinalRankings(new Map())

		expect(commit).not.toHaveBeenCalled()
	})
})
