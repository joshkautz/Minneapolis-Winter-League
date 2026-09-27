/**
 * Unsubscribe links. Each player has a random token on their private
 * contact document; a link carries their id, the token and a category, and
 * only a matching token turns that category off. No secret to manage, and
 * nobody can unsubscribe someone else by guessing.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { Firestore } from 'firebase-admin/firestore'
import { EMAIL_CONFIG } from '../config/constants.js'
import { playerContactRef } from '../shared/database.js'
import type { OptionalEmailCategory, PlayerContactDocument } from '../types.js'

const OPTIONAL_CATEGORIES: readonly OptionalEmailCategory[] = [
	'teams',
	'registration',
	'announcements',
]

export const isOptionalCategory = (
	value: unknown
): value is OptionalEmailCategory =>
	OPTIONAL_CATEGORIES.includes(value as OptionalEmailCategory)

/** The player's token, created the first time they are sent email. */
export async function unsubscribeTokenFor(
	firestore: Firestore,
	playerId: string
): Promise<string> {
	const ref = playerContactRef(firestore, playerId)
	return await firestore.runTransaction(async (txn) => {
		const existing = (
			(await txn.get(ref)).data() as PlayerContactDocument | undefined
		)?.unsubscribeToken
		if (existing) return existing
		const token = randomBytes(24).toString('base64url')
		txn.set(ref, { unsubscribeToken: token }, { merge: true })
		return token
	})
}

export const unsubscribeUrl = (
	playerId: string,
	token: string,
	category: OptionalEmailCategory
): string => {
	const params = new URLSearchParams({ p: playerId, t: token, c: category })
	return `${EMAIL_CONFIG.SITE_URL}/unsubscribe?${params}`
}

const tokensMatch = (a: string, b: string): boolean => {
	const left = Buffer.from(a)
	const right = Buffer.from(b)
	return left.length === right.length && timingSafeEqual(left, right)
}

/** Turns a category off for the player if the token is theirs. */
export async function applyUnsubscribe(
	firestore: Firestore,
	request: { playerId: string; token: string; category: OptionalEmailCategory }
): Promise<boolean> {
	const ref = playerContactRef(firestore, request.playerId)
	const contact = (await ref.get()).data() as PlayerContactDocument | undefined
	if (
		!contact?.unsubscribeToken ||
		!tokensMatch(contact.unsubscribeToken, request.token)
	) {
		return false
	}
	await ref.set(
		{ emailPreferences: { [request.category]: false } },
		{ merge: true }
	)
	return true
}
