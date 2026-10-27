/**
 * Email verification and password reset, sent by the league through the
 * outbox instead of by Firebase.
 *
 * Firebase Auth still makes the one-time codes (the Admin SDK's
 * `generate…Link`), and the App still spends them (`applyActionCode`,
 * `confirmPasswordReset`). Only the email and the page it opens are the
 * league's: the code is lifted out of Firebase's link and put on
 * `/auth/action` on the league's own site.
 */

import { getAuth } from 'firebase-admin/auth'
import type { Firestore } from 'firebase-admin/firestore'
import { EMAIL_CONFIG } from '../config/constants.js'
import { Collections } from '../types.js'
import { queueEmailOnce, type Recipient } from './outbox.js'

/**
 * At most one of each email per account in this window. A double click or
 * an impatient second request sends nothing new, and nobody can use the
 * reset form to flood an inbox.
 */
export const ACCOUNT_EMAIL_INTERVAL_MS = 2 * 60 * 1000

export type AccountEmail = 'emailVerification' | 'passwordReset'

const MODE: Record<AccountEmail, string> = {
	emailVerification: 'verifyEmail',
	passwordReset: 'resetPassword',
}

/**
 * The league's link for a Firebase action link: the same mode and code on
 * `/auth/action`. Anything else Firebase put in its link (its API key, a
 * continue URL) is left behind; the App supplies its own API key.
 *
 * @throws when the link carries no code, which would make a dead email
 */
export function leagueActionLink(
	firebaseLink: string,
	email: AccountEmail,
	siteUrl: string = EMAIL_CONFIG.SITE_URL
): string {
	const code = new URL(firebaseLink).searchParams.get('oobCode')
	if (!code) throw new Error('Firebase returned an action link with no code')
	const link = new URL('/auth/action', siteUrl)
	link.searchParams.set('mode', MODE[email])
	link.searchParams.set('oobCode', code)
	return link.toString()
}

/** The mail id for an account's email in the window `now` falls in. */
export const accountEmailMailId = (
	email: AccountEmail,
	uid: string,
	now: Date
): string =>
	`${email}-${uid}-${Math.floor(now.getTime() / ACCOUNT_EMAIL_INTERVAL_MS)}`

/**
 * Who the email goes to: the player, when the account has a player
 * document, so it is greeted by name and skips an address that bounced;
 * the sign-in address otherwise, as right after sign-up.
 */
async function recipientFor(
	firestore: Firestore,
	uid: string,
	address: string
): Promise<Recipient> {
	const player = await firestore.collection(Collections.PLAYERS).doc(uid).get()
	return player.exists ? { playerId: uid } : { address }
}

/**
 * Makes a fresh one-time link for the account and queues its email,
 * unless one already went out in this window.
 *
 * @returns whether an email was queued
 */
export async function queueAccountEmail(
	firestore: Firestore,
	email: AccountEmail,
	user: { uid: string; email: string },
	now: Date = new Date()
): Promise<boolean> {
	const auth = getAuth()
	const firebaseLink =
		email === 'emailVerification'
			? await auth.generateEmailVerificationLink(user.email)
			: await auth.generatePasswordResetLink(user.email)
	const outcome = await queueEmailOnce(firestore, {
		id: accountEmailMailId(email, user.uid, now),
		to: await recipientFor(firestore, user.uid, user.email),
		template: email,
		props: { link: leagueActionLink(firebaseLink, email) },
	})
	return outcome === 'queued'
}
