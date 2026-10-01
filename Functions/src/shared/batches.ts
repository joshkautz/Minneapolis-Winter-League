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
	/** Flushes every write, throwing if any failed. */
	finish(): Promise<void>
}

/**
 * A BulkWriter whose failures are not lost: `close()` resolves even when
 * writes failed, so each write's promise is kept and checked afterwards.
 * `label` names the writes in the error ("rankings writes failed").
 */
export function trackedBulkWriter(
	firestore: Pick<Firestore, 'bulkWriter'>,
	label: string
): TrackedWriter {
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
					`${failed.length} of ${writes.length} ${label} writes failed: ${String(failed[0].reason)}`
				)
			}
		},
	}
}
