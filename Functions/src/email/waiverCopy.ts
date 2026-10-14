/**
 * The email that gives a player their copy of the waiver they signed,
 * queued by `signWaiver` in the transaction that records the signature.
 */

import { FIREBASE_CONFIG } from '../config/constants.js'
import type { WaiverSignatureDocument } from '../types.js'
import type { QueuedEmail } from './outbox.js'

/** One copy per signature, so a retried write cannot queue a second. */
export const waiverCopyMailId = (signatureId: string): string =>
	`waiverCopy-${signatureId}`

/** "Thursday, October 15, 2026 at 7:42 PM CDT", on Minneapolis's clock. */
export const signedAtText = (date: Date): string =>
	new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short',
		timeZone: FIREBASE_CONFIG.TIME_ZONE,
	}).format(date)

/**
 * The signature fields the copy repeats. A player's own signature always
 * has a signer and a role; only an admin's record of a paper waiver leaves
 * them unset, and that sends no copy.
 */
type SignedRecord = Pick<
	WaiverSignatureDocument,
	'versionId' | 'versionSha256' | 'participantName' | 'guardianRelationship'
> & {
	signerName: string
	signerRole: NonNullable<WaiverSignatureDocument['signerRole']>
}

/**
 * The copy of a waiver a player signed themselves. `signedAt` is the
 * moment the signature was made; the record's own timestamp is the
 * server's, a few milliseconds later, and is what the full record shows.
 */
export function waiverCopyEmail({
	playerId,
	signatureId,
	seasonName,
	record,
	signedAt,
}: {
	playerId: string
	signatureId: string
	seasonName: string
	record: SignedRecord
	signedAt: Date
}): QueuedEmail<'waiverCopy'> & { id: string } {
	return {
		id: waiverCopyMailId(signatureId),
		to: { playerId },
		template: 'waiverCopy',
		props: {
			seasonName,
			versionId: record.versionId,
			versionSha256: record.versionSha256,
			participantName: record.participantName,
			signerName: record.signerName,
			signerRole: record.signerRole,
			guardianRelationship: record.guardianRelationship,
			signedAt: signedAtText(signedAt),
			playerId,
			signatureId,
		},
	}
}
