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
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { EMAIL_CONFIG } from '../config/constants.js'
import { Collections } from '../types.js'
import { queueEmailInTransaction, type Recipient } from './outbox.js'

/**
 * How long after an account email before the account can be sent another
 * of the same kind, counted from the last one sent. The first usually
 * arrives within a minute; a second press before then only fills the
 * inbox, and nobody can use the reset form to flood one.
 */
export const ACCOUNT_EMAIL_COOLDOWN_MS = 10 * 60 * 1000

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

/**
 * The last-sent times, at `accountEmails/{uid}`: one field per kind of
 * email. Written only here, in the transaction that queues the email.
 */
type AccountEmailTimes = Partial<Record<AccountEmail, Timestamp>>

/** The mail id for an account's email sent at `now`. */
export const accountEmailMailId = (
	email: AccountEmail,
	uid: string,
	now: Date
): string => `${email}-${uid}-${now.getTime()}`

/** What a request for an account email came to. */
export interface AccountEmailOutcome {
	/** False while the cooldown after the last one runs. */
	sent: boolean
	/** When the last one (perhaps this one) was sent. */
	lastSentAt: Date
	/** When another may be sent. */
	nextAllowedAt: Date
}

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
 * Makes a fresh one-time link for the account and queues its email, unless
 * the last of that kind went out within the cooldown. The check and the
 * queueing are one transaction, so two requests at once send one email.
 */
export async function queueAccountEmail(
	firestore: Firestore,
	email: AccountEmail,
	user: { uid: string; email: string },
	now: Date = new Date()
): Promise<AccountEmailOutcome> {
	const timesRef = firestore
		.collection(Collections.ACCOUNT_EMAILS)
		.doc(user.uid)
	const lastSent = (
		(await timesRef.get()).data() as AccountEmailTimes | undefined
	)?.[email]?.toDate()
	const cooling = (last: Date | undefined): last is Date =>
		last !== undefined &&
		now.getTime() - last.getTime() < ACCOUNT_EMAIL_COOLDOWN_MS
	const refused = (last: Date): AccountEmailOutcome => ({
		sent: false,
		lastSentAt: last,
		nextAllowedAt: new Date(last.getTime() + ACCOUNT_EMAIL_COOLDOWN_MS),
	})
	// Spares generating a link nobody will be sent; the transaction below
	// is what actually decides.
	if (cooling(lastSent)) return refused(lastSent)

	const auth = getAuth()
	const firebaseLink =
		email === 'emailVerification'
			? await auth.generateEmailVerificationLink(user.email)
			: await auth.generatePasswordResetLink(user.email)
	const to = await recipientFor(firestore, user.uid, user.email)

	return firestore.runTransaction(async (txn) => {
		const last = (
			(await txn.get(timesRef)).data() as AccountEmailTimes | undefined
		)?.[email]?.toDate()
		if (cooling(last)) return refused(last)
		queueEmailInTransaction(txn, firestore, {
			id: accountEmailMailId(email, user.uid, now),
			to,
			template: email,
			props: { link: leagueActionLink(firebaseLink, email) },
		})
		txn.set(timesRef, { [email]: Timestamp.fromDate(now) }, { merge: true })
		return {
			sent: true,
			lastSentAt: now,
			nextAllowedAt: new Date(now.getTime() + ACCOUNT_EMAIL_COOLDOWN_MS),
		}
	})
}
