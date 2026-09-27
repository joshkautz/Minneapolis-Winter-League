/** Shared setup for the email suites. Nothing here sends email. */

import type { Firestore } from 'firebase-admin/firestore'
import type {
	OutgoingEmail,
	SendEmail,
	SendResult,
} from '../../Functions/src/email/sender.js'
import { playerContactRef } from '../../Functions/src/shared/database.js'

export type FakeResend = SendEmail & {
	sent: { email: OutgoingEmail; key: string }[]
}

/** Stands in for Resend, recording every send and answering with `result`. */
export const fakeResend = (
	result: SendResult = { ok: true, id: 'resend-1' }
): FakeResend => {
	const sent: FakeResend['sent'] = []
	const send = (async (email: OutgoingEmail, key: string) => {
		sent.push({ email, key })
		return result
	}) as FakeResend
	send.sent = sent
	return send
}

export const setEmailMode = (
	firestore: Firestore,
	mode: 'off' | 'test' | 'live',
	testRecipients: string[] = []
) => firestore.doc('system/email').set({ mode, testRecipients })

/** A player with an email address on their private contact document. */
export const seedEmailPlayer = async (
	firestore: Firestore,
	id: string,
	options: { email?: string; admin?: boolean } = {}
): Promise<void> => {
	await firestore
		.collection('players')
		.doc(id)
		.set({
			firstname: 'Pat',
			lastname: 'Player',
			admin: options.admin ?? false,
			banned: false,
		})
	await playerContactRef(firestore, id).set({
		email: options.email ?? `${id}@example.com`,
	})
}

export const contactOf = async (firestore: Firestore, id: string) =>
	(await playerContactRef(firestore, id).get()).data()

/** The p, t and c of a URL. */
export const linkParams = (url: string): Record<string, string> =>
	Object.fromEntries(new URL(url).searchParams)
