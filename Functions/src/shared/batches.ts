/**
 * Writes whose number grows with the data. A WriteBatch is held under
 * Firestore's limit of 500 writes; the emulator enforces no limit, so each
 * use is covered by a unit test that counts commits (see batches.test.ts).
 * Writes that need not be atomic go through a BulkWriter, which has no limit.
 */

import type {
	DocumentData,
	DocumentReference,
	Firestore,
} from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'

/** Comfortably under the 500-write limit. */
export const WRITES_PER_BATCH = 450

/** Deletes every document in `refs`, one batch per `perBatch`. */
export async function deleteInBatches(
	firestore: Pick<Firestore, 'batch'>,
	refs: DocumentReference[],
	perBatch = WRITES_PER_BATCH
): Promise<number> {
	for (let start = 0; start < refs.length; start += perBatch) {
		const batch = firestore.batch()
		for (const ref of refs.slice(start, start + perBatch)) batch.delete(ref)
		await batch.commit()
	}
	return refs.length
}

export interface TrackedWriter {
	set(ref: DocumentReference, data: DocumentData): void
	delete(ref: DocumentReference): void
	/**
	 * Flushes every write, throwing if any failed — or, given a deadline,
	 * if they have not all settled by then, saying how many had.
	 */
	finish(options?: { deadlineMs?: number }): Promise<void>
}

/** How many times a write is tried before it is reported as failed. */
export const MAX_WRITE_ATTEMPTS = 5

/**
 * gRPC codes worth trying again: contention, an unavailable or overloaded
 * backend, a timeout. Anything else — a permission or a precondition — will
 * fail the same way every time.
 */
const RETRYABLE_CODES = new Set([
	4, // DEADLINE_EXCEEDED
	8, // RESOURCE_EXHAUSTED
	10, // ABORTED
	13, // INTERNAL
	14, // UNAVAILABLE
])

/**
 * A BulkWriter whose failures are not lost: `close()` resolves even when
 * writes failed, so each write's promise is kept and checked afterwards.
 * Every failed attempt is logged with the document it was for, and a write
 * is retried only for an error worth retrying, at most MAX_WRITE_ATTEMPTS
 * times. `label` names the writes in messages ("rankings writes failed").
 */
export function trackedBulkWriter(
	firestore: Pick<Firestore, 'bulkWriter'>,
	label: string
): TrackedWriter {
	const writer = firestore.bulkWriter()
	writer.onWriteError((error) => {
		const retry =
			RETRYABLE_CODES.has(error.code) &&
			error.failedAttempts < MAX_WRITE_ATTEMPTS
		logger.warn(`A ${label} write failed`, {
			path: error.documentRef.path,
			operation: error.operationType,
			code: error.code,
			error: error.message,
			attempt: error.failedAttempts,
			willRetry: retry,
		})
		return retry
	})
	const writes: Promise<unknown>[] = []
	let settled = 0
	const track = (write: Promise<unknown>): void => {
		writes.push(write)
		write.then(
			() => settled++,
			() => settled++
		)
	}
	return {
		set: (ref, data) => track(writer.set(ref, data)),
		delete: (ref) => track(writer.delete(ref)),
		finish: async ({ deadlineMs } = {}): Promise<void> => {
			const closed = writer.close()
			if (deadlineMs === undefined) {
				await closed
			} else {
				let timer: ReturnType<typeof setTimeout> | undefined
				const deadline = new Promise<never>((_, reject) => {
					timer = setTimeout(
						() =>
							reject(
								new Error(
									`${label} writes did not finish within ${deadlineMs / 1000}s: ${settled} of ${writes.length} settled`
								)
							),
						deadlineMs
					)
				})
				try {
					await Promise.race([closed, deadline])
				} finally {
					clearTimeout(timer)
				}
			}
			const failed = (await Promise.allSettled(writes)).filter(
				(result): result is PromiseRejectedResult =>
					result.status === 'rejected'
			)
			if (failed.length > 0) {
				throw new Error(
					`${failed.length} of ${writes.length} ${label} writes failed: ${String(failed[0].reason)}`
				)
			}
		},
	}
}
