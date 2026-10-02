import { describe, expect, it, vi } from 'vitest'
import type { DocumentReference } from 'firebase-admin/firestore'

const warn = vi.fn()
vi.mock('firebase-functions/v2', () => ({
	logger: { warn: (...args: unknown[]) => warn(...args) },
}))

const {
	deleteInBatches,
	MAX_WRITE_ATTEMPTS,
	trackedBulkWriter,
	WRITES_PER_BATCH,
} = await import('./batches.js')

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

describe('trackedBulkWriter', () => {
	type RetryPolicy = (error: {
		code: number
		message: string
		documentRef: { path: string }
		operationType: string
		failedAttempts: number
	}) => boolean

	/** A BulkWriter that hands back its retry policy and its close(). */
	const fakeWriter = (close: () => Promise<void> = async () => undefined) => {
		let policy: RetryPolicy = () => false
		const writes: { resolve: () => void }[] = []
		const firestore = {
			bulkWriter: () => ({
				onWriteError: (callback: RetryPolicy) => {
					policy = callback
				},
				set: () => new Promise<void>((resolve) => writes.push({ resolve })),
				delete: () => Promise.resolve(),
				close,
			}),
		}
		return { firestore, policy: () => policy, writes }
	}

	const error = (code: number, failedAttempts: number) => ({
		code,
		message: 'boom',
		documentRef: { path: 'teams/t1/badges/b1' },
		operationType: 'set',
		failedAttempts,
	})

	it('retries contention and outages, up to the attempt limit, and logs each', () => {
		const fake = fakeWriter()
		trackedBulkWriter(fake.firestore as never, 'badge')
		const policy = fake.policy()

		expect(policy(error(10, 1))).toBe(true) // ABORTED
		expect(policy(error(14, MAX_WRITE_ATTEMPTS - 1))).toBe(true) // UNAVAILABLE
		expect(policy(error(14, MAX_WRITE_ATTEMPTS))).toBe(false)
		expect(warn).toHaveBeenCalledWith(
			'A badge write failed',
			expect.objectContaining({
				path: 'teams/t1/badges/b1',
				code: 14,
				willRetry: false,
			})
		)
	})

	it('does not retry an error that would fail the same way again', () => {
		const fake = fakeWriter()
		trackedBulkWriter(fake.firestore as never, 'badge')
		expect(fake.policy()(error(7, 1))).toBe(false) // PERMISSION_DENIED
	})

	it('fails with how far it got when writes outlast the deadline', async () => {
		vi.useFakeTimers()
		const fake = fakeWriter(() => new Promise<void>(() => undefined))
		const writer = trackedBulkWriter(fake.firestore as never, 'badge')
		const ref = { path: 'teams/t1/badges/b1' } as DocumentReference
		writer.set(ref, {})
		writer.set(ref, {})
		fake.writes[0].resolve()
		await Promise.resolve()

		const finished = writer.finish({ deadlineMs: 1_000 })
		const outcome = expect(finished).rejects.toThrow(
			'badge writes did not finish within 1s: 1 of 2 settled'
		)
		await vi.advanceTimersByTimeAsync(1_000)
		await outcome
		vi.useRealTimers()
	})
})
