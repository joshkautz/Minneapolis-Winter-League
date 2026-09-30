/**
 * Writes whose number grows with the data, split under Firestore's limit of
 * 500 writes per batch. The emulator enforces no limit, so each use is
 * covered by a unit test that counts commits (see batches.test.ts).
 */

import type { DocumentReference, Firestore } from 'firebase-admin/firestore'

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
