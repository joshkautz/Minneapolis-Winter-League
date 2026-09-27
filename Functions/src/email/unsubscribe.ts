/**
 * Email preferences and unsubscribing.
 *
 * Each player has a random token on their private contact document. Links in
 * their email carry their id and that token, so they can change what they
 * receive without signing in — CAN-SPAM forbids requiring a login — while
 * nobody can change someone else's by guessing.
 *
 * Two links, for two readers:
 * - The footer's "Unsubscribe" link opens the preferences page on the site
 *   (`/email-preferences`), for a person.
 * - The `List-Unsubscribe` header points at `/unsubscribe`, which mail apps
 *   POST to for one-click unsubscribe (RFC 8058).
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { EMAIL_CONFIG } from '../config/constants.js'
import { playerContactRef } from '../shared/database.js'
import type { OptionalEmailCategory, PlayerContactDocument } from '../types.js'

export const OPTIONAL_CATEGORIES: readonly OptionalEmailCategory[] = [
	'announcements',
	'registration',
	'teams',
]

export const isOptionalCategory = (
	value: unknown
): value is OptionalEmailCategory =>
	OPTIONAL_CATEGORIES.includes(value as OptionalEmailCategory)

export type EmailPreferences = Record<OptionalEmailCategory, boolean>

/** What a player receives: everything, unless they turned it off. */
export const preferencesOf = (
	contact: PlayerContactDocument | undefined
): EmailPreferences =>
	Object.fromEntries(
		OPTIONAL_CATEGORIES.map((category) => [
			category,
			contact?.emailPreferences?.[category] !== false,
		])
	) as EmailPreferences

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

const linkQuery = (
	playerId: string,
	token: string,
	category: OptionalEmailCategory
): string =>
	new URLSearchParams({ p: playerId, t: token, c: category }).toString()

/** The footer link: the preferences page, offering to unsubscribe from `category`. */
export const preferencesPageUrl = (
	playerId: string,
	token: string,
	category: OptionalEmailCategory
): string =>
	`${EMAIL_CONFIG.SITE_URL}/email-preferences?${linkQuery(playerId, token, category)}`

/** The `List-Unsubscribe` target, which mail apps POST to. */
export const oneClickUnsubscribeUrl = (
	playerId: string,
	token: string,
	category: OptionalEmailCategory
): string =>
	`${EMAIL_CONFIG.SITE_URL}/unsubscribe?${linkQuery(playerId, token, category)}`

/** Both links for one email, creating the player's token if need be. */
export async function preferenceLinks(
	firestore: Firestore,
	playerId: string,
	category: OptionalEmailCategory
): Promise<{ page: string; oneClick: string }> {
	const token = await unsubscribeTokenFor(firestore, playerId)
	return {
		page: preferencesPageUrl(playerId, token, category),
		oneClick: oneClickUnsubscribeUrl(playerId, token, category),
	}
}

/** Whether `token` is the player's, compared in constant time. */
export const tokenMatches = (
	contact: PlayerContactDocument | undefined,
	token: string
): boolean => {
	const expected = contact?.unsubscribeToken
	if (!expected || !token) return false
	const left = Buffer.from(expected)
	const right = Buffer.from(token)
	return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Saves changes to a player's preferences, returning the result. Unmentioned
 * categories keep their setting.
 */
export async function savePreferences(
	firestore: Firestore,
	playerId: string,
	changes: Partial<EmailPreferences>
): Promise<EmailPreferences> {
	const ref = playerContactRef(firestore, playerId)
	await ref.set(
		{
			emailPreferences: changes,
			emailPreferencesUpdatedAt: FieldValue.serverTimestamp(),
		},
		{ merge: true }
	)
	return preferencesOf((await ref.get()).data())
}

/**
 * Turns one category off for the player if the token is theirs: the
 * one-click unsubscribe.
 */
export async function applyUnsubscribe(
	firestore: Firestore,
	request: { playerId: string; token: string; category: OptionalEmailCategory }
): Promise<boolean> {
	const contact = (
		await playerContactRef(firestore, request.playerId).get()
	).data()
	if (!tokenMatches(contact, request.token)) return false
	await savePreferences(firestore, request.playerId, {
		[request.category]: false,
	})
	return true
}

/** "j•••@example.com": enough to recognise, not enough to harvest. */
export const maskEmail = (email: string): string => {
	const [local, domain] = email.split('@')
	if (!domain) return '•••'
	return `${local.slice(0, 1)}•••@${domain}`
}
