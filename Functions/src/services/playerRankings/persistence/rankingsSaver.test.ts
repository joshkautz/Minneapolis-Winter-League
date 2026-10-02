import { describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import type { RankingProjections } from '../engine/projections.js'

/**
 * A BulkWriter's `close()` resolves even when writes failed, so a rebuild
 * whose writes were refused would report success over half-saved rankings.
 * The emulator never refuses a write, so only a fake can show the failure
 * reaching the caller.
 */

vi.mock('firebase-functions/v2', () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { saveRankings } = await import('./rankingsSaver.js')

const fakeFirestore = (failWrites: boolean): Firestore => {
	const ref = (path: string): unknown => ({
		id: path.split('/').pop(),
		path,
		collection: (name: string) => collection(`${path}/${name}`),
	})
	const collection = (path: string): unknown => ({
		doc: (id: string) => ref(`${path}/${id}`),
		listDocuments: async () => [],
	})
	return {
		collection,
		bulkWriter: () => ({
			set: () =>
				failWrites
					? Promise.reject(new Error('PERMISSION_DENIED'))
					: Promise.resolve(),
			delete: () => Promise.resolve(),
			close: () => Promise.resolve(),
			onWriteError: () => undefined,
		}),
	} as unknown as Firestore
}

const projections: RankingProjections = {
	final: [
		{
			playerId: 'p1',
			rating: 30,
			rank: 1,
			totalGames: 1,
			totalSeasons: 1,
			lastSeasonId: 's1',
			lastRatingChange: 5,
		},
	],
	histories: new Map(),
	seasons: new Map(),
}

const save = (firestore: Firestore): Promise<void> =>
	saveRankings(firestore, {
		projections,
		playerNames: new Map([['p1', 'Player One']]),
		seasonIds: ['s1'],
		calculationId: 'calc-1',
	})

describe('saveRankings', () => {
	it('fails when a write fails, rather than reporting success', async () => {
		await expect(save(fakeFirestore(true))).rejects.toThrow(
			/1 of 1 rankings writes failed: Error: PERMISSION_DENIED/
		)
	})

	it('resolves when every write succeeds', async () => {
		await expect(save(fakeFirestore(false))).resolves.toBeUndefined()
	})
})
