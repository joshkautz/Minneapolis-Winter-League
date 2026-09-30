import { describe, expect, it } from 'vitest'
import type { DocumentReference } from 'firebase-admin/firestore'
import { deleteInBatches, WRITES_PER_BATCH } from './batches.js'

/** A Firestore that records each batch it commits, and its size. */
const recordingFirestore = () => {
	const commits: number[] = []
	return {
		commits,
		batch: () => {
			let size = 0
			return {
				delete: () => {
					size += 1
				},
				commit: async () => {
					commits.push(size)
				},
			}
		},
	}
}

const refs = (count: number) =>
	Array.from({ length: count }, (_, i) => ({
		id: `doc-${i}`,
	})) as never as DocumentReference[]

describe('deleteInBatches', () => {
	it('stays under Firestore’s 500-write limit', () => {
		expect(WRITES_PER_BATCH).toBeLessThan(500)
	})

	it('splits 1,000 deletes into batches no larger than the limit', async () => {
		const firestore = recordingFirestore()

		expect(await deleteInBatches(firestore as never, refs(1_000))).toBe(1_000)

		expect(firestore.commits).toEqual([450, 450, 100])
	})

	it('commits one batch for a handful', async () => {
		const firestore = recordingFirestore()
		await deleteInBatches(firestore as never, refs(3))
		expect(firestore.commits).toEqual([3])
	})

	it('commits nothing when there is nothing to delete', async () => {
		const firestore = recordingFirestore()
		expect(await deleteInBatches(firestore as never, [])).toBe(0)
		expect(firestore.commits).toEqual([])
	})
})
