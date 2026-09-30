/**
 * Whether email goes out at all, read from `system/email`. Absent, or
 * anything unrecognised, means off: the safe answer when in doubt.
 */

import type { Firestore } from 'firebase-admin/firestore'
import type { EmailSettingsDocument, MailStatus } from '../types.js'

const EMAIL_SETTINGS_PATH = 'system/email'

export const EMAIL_OFF: EmailSettingsDocument = {
	mode: 'off',
	testRecipients: [],
}

export async function readEmailSettings(
	firestore: Firestore
): Promise<EmailSettingsDocument> {
	const data = (await firestore.doc(EMAIL_SETTINGS_PATH).get()).data()
	const mode = data?.mode
	if (mode !== 'test' && mode !== 'live') return EMAIL_OFF
	const recipients = Array.isArray(data?.testRecipients)
		? data.testRecipients.filter(
				(address: unknown): address is string => typeof address === 'string'
			)
		: []
	return {
		mode,
		testRecipients: recipients.map((address: string) => address.toLowerCase()),
	}
}

export type Delivery =
	| { send: true }
	| {
			send: false
			status: Extract<MailStatus, 'held' | 'skipped'>
			reason: string
	  }

/** Whether an email to `address` goes out under `settings`. */
export function deliveryFor(
	settings: EmailSettingsDocument,
	address: string
): Delivery {
	switch (settings.mode) {
		case 'live':
			return { send: true }
		case 'test':
			return settings.testRecipients.includes(address.toLowerCase())
				? { send: true }
				: {
						send: false,
						status: 'skipped',
						reason: 'Email is in test mode and this is not a test recipient.',
					}
		default:
			return { send: false, status: 'held', reason: 'Email is turned off.' }
	}
}
