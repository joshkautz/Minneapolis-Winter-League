/**
 * Spotting a banned player who signs up again under a new account.
 *
 * A waiver asks for a legal name, date of birth, mailing address and
 * emergency contacts, and records where it was signed from. When a player
 * signs, `signWaiver` compares those with every banned player's account and
 * waivers here. Two or more things in common (a full name counts as two:
 * the first and last together) flag the new account for an admin to look
 * at, in `banReviews/{playerId}`, and email the admins. Nothing is refused:
 * the waiver is signed either way, and an admin decides with
 * `resolveBanReview`.
 *
 * The review records which banned account it resembles and what they
 * share, never the details themselves; an admin can open both waivers.
 */

import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { queueEmailOnce } from '../email/outbox.js'
import {
	Collections,
	WAIVER_SIGNATURES_SUBCOLLECTION,
	type BanMatchSignal,
	type BanReviewDocument,
	type PlayerDocument,
	type WaiverSignatureDocument,
} from '../types.js'

/** What a waiver tells about the person who signed it. */
export interface IdentityRecord {
	/** The participant's full name. */
	name: string
	dateOfBirth: string | null
	mailingAddress: string | null
	phones: string[]
	ipAddress: string | null
}

/** Letters and digits only, lowercased, so "O’Dowd" and "odowd" agree. */
const normalized = (text: string | null | undefined): string =>
	(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

const lastWord = (name: string): string =>
	normalized(name.trim().split(/\s+/).pop())

/** The last ten digits, so "+1 (612) 555-0100" and "612-555-0100" agree. */
const phoneDigits = (phone: string): string =>
	phone.replace(/\D/g, '').slice(-10)

/** A waiver signature as an identity record. */
export const identityOfSignature = (
	signature: Pick<
		WaiverSignatureDocument,
		| 'participantName'
		| 'dateOfBirth'
		| 'mailingAddress'
		| 'emergencyContacts'
		| 'ipAddress'
	>
): IdentityRecord => ({
	name: signature.participantName,
	dateOfBirth: signature.dateOfBirth,
	mailingAddress: signature.mailingAddress,
	phones: signature.emergencyContacts.map((contact) => contact.phone),
	ipAddress: signature.ipAddress,
})

/**
 * What a new signature shares with any of a banned player's records: their
 * account's name and every waiver they signed.
 */
export function sharedSignals(
	candidate: IdentityRecord,
	bannedRecords: readonly IdentityRecord[]
): BanMatchSignal[] {
	const signals = new Set<BanMatchSignal>()
	const phones = new Set(candidate.phones.map(phoneDigits).filter(Boolean))
	for (const record of bannedRecords) {
		if (
			normalized(record.name) &&
			normalized(record.name) === normalized(candidate.name)
		) {
			signals.add('full name')
		}
		if (
			lastWord(record.name) &&
			lastWord(record.name) === lastWord(candidate.name)
		) {
			signals.add('last name')
		}
		if (record.dateOfBirth && record.dateOfBirth === candidate.dateOfBirth) {
			signals.add('date of birth')
		}
		if (
			normalized(record.mailingAddress) &&
			normalized(record.mailingAddress) === normalized(candidate.mailingAddress)
		) {
			signals.add('mailing address')
		}
		if (record.phones.some((phone) => phones.has(phoneDigits(phone)))) {
			signals.add('emergency contact phone')
		}
		if (record.ipAddress && record.ipAddress === candidate.ipAddress) {
			signals.add('IP address')
		}
	}
	return [...signals]
}

/** Enough in common to be worth an admin's look. */
export const MATCH_THRESHOLD = 2

/** The banned players a signature resembles, with what they share. */
export async function banMatches(
	firestore: Firestore,
	playerId: string,
	candidate: IdentityRecord
): Promise<BanReviewDocument['matches']> {
	const banned = await firestore
		.collection(Collections.PLAYERS)
		.where('banned', '==', true)
		.get()
	const matches: BanReviewDocument['matches'] = []
	for (const doc of banned.docs) {
		if (doc.id === playerId) continue
		const player = doc.data() as PlayerDocument
		const accountName =
			`${player.firstname ?? ''} ${player.lastname ?? ''}`.trim()
		const signatures = await doc.ref
			.collection(WAIVER_SIGNATURES_SUBCOLLECTION)
			.get()
		const records: IdentityRecord[] = [
			{
				name: accountName,
				dateOfBirth: null,
				mailingAddress: null,
				phones: [],
				ipAddress: null,
			},
			...signatures.docs.map((sig) =>
				identityOfSignature(sig.data() as WaiverSignatureDocument)
			),
		]
		const signals = sharedSignals(candidate, records)
		if (signals.length >= MATCH_THRESHOLD) {
			matches.push({
				bannedPlayerId: doc.id,
				bannedPlayerName: accountName || 'A banned player',
				signals,
			})
		}
	}
	return matches
}

/**
 * Flags a new signature that resembles a banned player's, and emails the
 * admins. A review an admin has already decided is not raised again for
 * the same banned accounts.
 *
 * @returns whether the player was flagged
 */
export async function flagBanEvasion(
	firestore: Firestore,
	{
		playerId,
		signatureId,
		seasonId,
		candidate,
	}: {
		playerId: string
		signatureId: string
		seasonId: string
		candidate: IdentityRecord
	}
): Promise<boolean> {
	const matches = await banMatches(firestore, playerId, candidate)
	if (matches.length === 0) return false

	const reviewRef = firestore.collection(Collections.BAN_REVIEWS).doc(playerId)
	const existing = (await reviewRef.get()).data() as
		BanReviewDocument | undefined
	const decided = new Set(
		existing && existing.status !== 'open'
			? existing.matches.map((match) => match.bannedPlayerId)
			: []
	)
	if (matches.every((match) => decided.has(match.bannedPlayerId))) {
		return false
	}

	await reviewRef.set({
		playerId,
		playerName: candidate.name,
		matches,
		signatureId,
		seasonId,
		status: 'open',
		flaggedAt: FieldValue.serverTimestamp(),
		resolvedAt: null,
		resolvedBy: null,
	})

	const admins = await firestore
		.collection(Collections.PLAYERS)
		.where('admin', '==', true)
		.get()
	await Promise.all(
		admins.docs.map((admin) =>
			queueEmailOnce(firestore, {
				id: `banReview-${playerId}-${signatureId}-${admin.id}`,
				to: { playerId: admin.id },
				template: 'banReviewAlert',
				props: {
					playerName: candidate.name,
					matches: matches.map(({ bannedPlayerName, signals }) => ({
						bannedPlayerName,
						signals,
					})),
				},
			})
		)
	)
	logger.warn('Possible ban evasion flagged for review', {
		playerId,
		bannedPlayerIds: matches.map((match) => match.bannedPlayerId),
	})
	return true
}
