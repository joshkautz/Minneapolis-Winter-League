/**
 * The history of a player's name: one entry per change to the first name,
 * last name or nickname, whoever made it, under
 * `players/{uid}/nameHistory`. Admins read it to see who a player was
 * before they changed their name; nothing else reads it.
 *
 * Every writer of a name records the change through here, in the same
 * transaction or batch as the change itself, so the history cannot miss
 * a change or record one that was not saved.
 */

import {
	FieldValue,
	type DocumentReference,
	type Transaction,
	type WriteBatch,
} from 'firebase-admin/firestore'
import {
	NAME_HISTORY_SUBCOLLECTION,
	type NameHistoryDocument,
	type PlayerDocument,
	type PlayerNameSnapshot,
} from '../types.js'

/** The name fields of a player document, with no nickname read as null. */
export const nameSnapshot = (
	player: Pick<PlayerDocument, 'firstname' | 'lastname' | 'nickname'>
): PlayerNameSnapshot => ({
	firstname: player.firstname ?? '',
	lastname: player.lastname ?? '',
	nickname: player.nickname ?? null,
})

const sameName = (a: PlayerNameSnapshot, b: PlayerNameSnapshot): boolean =>
	a.firstname === b.firstname &&
	a.lastname === b.lastname &&
	a.nickname === b.nickname

/** The entry for a change, or null when the name did not change. */
export function nameHistoryEntry(
	before: PlayerNameSnapshot | null,
	after: PlayerNameSnapshot,
	changedBy: string,
	source: NameHistoryDocument['source']
): (Omit<NameHistoryDocument, 'changedAt'> & { changedAt: FieldValue }) | null {
	if (before && sameName(before, after)) return null
	return {
		before,
		after,
		changedBy,
		source,
		changedAt: FieldValue.serverTimestamp(),
	}
}

/**
 * Adds the entry for a change to `writer`, the transaction or batch that
 * makes the change. Writes nothing when the name is unchanged.
 */
export function recordNameChange(
	writer: Transaction | WriteBatch,
	playerRef: DocumentReference,
	before: PlayerNameSnapshot | null,
	after: PlayerNameSnapshot,
	changedBy: string,
	source: NameHistoryDocument['source']
): void {
	const entry = nameHistoryEntry(before, after, changedBy, source)
	if (!entry) return
	const ref = playerRef.collection(NAME_HISTORY_SUBCOLLECTION).doc()
	writer.create(ref, entry)
}
