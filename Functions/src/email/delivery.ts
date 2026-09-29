/**
 * What became of email after Resend accepted it, from its webhook: the
 * outbox records sending, and this records delivery. It also keeps the
 * league from mailing addresses that cannot receive it:
 *
 * - A permanent bounce, or Resend blocking an address it has seen bounce,
 *   flags the player's contact `emailUndeliverable`, and the sender stops
 *   emailing that address until an admin changes it.
 * - A spam complaint turns that kind of email off for the player, as Gmail
 *   and Yahoo expect of a sender. Account email cannot be turned off.
 */

import {
	FieldValue,
	Timestamp,
	type Firestore,
	type Transaction,
} from 'firebase-admin/firestore'
import type { WebhookEventPayload } from 'resend'
import {
	Collections,
	type DeliveryStatus,
	type EmailUndeliverable,
	type MailDelivery,
	type MailDocument,
	type PlayerContactDocument,
} from '../types.js'
import { playerContactRef } from '../shared/database.js'
import { isOptionalCategory } from './unsubscribe.js'

/** A delivery report, reduced to what the league keeps. */
export interface DeliveryReport {
	/** Resend's email id: the mail document's `providerId`. */
	emailId: string
	status: DeliveryStatus
	at: Date
	/** The address it went to. */
	to: string
	detail?: string
	/** Whether the address should not be emailed again. */
	undeliverable: boolean
}

/** Reads a webhook event, or null for an event the league does not track. */
export function deliveryReportOf(
	event: WebhookEventPayload
): DeliveryReport | null {
	if (!('email_id' in event.data)) return null
	const base = {
		emailId: event.data.email_id,
		at: new Date(event.created_at),
		to: (event.data.to[0] ?? '').toLowerCase(),
	}
	switch (event.type) {
		case 'email.delivered':
			return { ...base, status: 'delivered', undeliverable: false }
		case 'email.delivery_delayed':
			return { ...base, status: 'delayed', undeliverable: false }
		case 'email.complained':
			return { ...base, status: 'complained', undeliverable: false }
		case 'email.bounced':
			return {
				...base,
				status: 'bounced',
				detail: event.data.bounce.message,
				// A transient bounce (a full mailbox, a server down) may pass.
				undeliverable: event.data.bounce.type === 'Permanent',
			}
		case 'email.suppressed':
			return {
				...base,
				status: 'suppressed',
				detail: event.data.suppressed.message,
				undeliverable: true,
			}
		case 'email.failed':
			return {
				...base,
				status: 'failed',
				detail: event.data.failed.reason,
				undeliverable: false,
			}
		default:
			return null
	}
}

/** How final a status is: a later report never replaces a more final one. */
const FINALITY: Record<DeliveryStatus, number> = {
	delayed: 0,
	delivered: 1,
	failed: 1,
	bounced: 1,
	suppressed: 1,
	// A complaint follows delivery, and matters most.
	complained: 2,
}

/**
 * Whether `next` should replace `current`. Reports can arrive late and out
 * of order: a delay reported after delivery is stale, and a delivery never
 * hides a complaint.
 */
export function supersedes(
	current: (Pick<MailDelivery, 'status'> & { at: Date }) | undefined,
	next: Pick<DeliveryReport, 'status' | 'at'>
): boolean {
	if (!current) return true
	const rank = FINALITY[next.status] - FINALITY[current.status]
	return rank > 0 || (rank === 0 && next.at >= current.at)
}

export type RecordOutcome = 'recorded' | 'stale' | 'unknown-email'

/** Records a report on its mail document and acts on the address. */
export async function recordDelivery(
	firestore: Firestore,
	report: DeliveryReport
): Promise<RecordOutcome> {
	const match = await firestore
		.collection(Collections.MAIL)
		.where('providerId', '==', report.emailId)
		.limit(1)
		.get()
	const mailRef = match.docs[0]?.ref
	if (!mailRef) return 'unknown-email'

	return firestore.runTransaction(async (transaction) => {
		const mail = (await transaction.get(mailRef)).data() as MailDocument
		const contactRef = mail.toPlayerId
			? playerContactRef(firestore, mail.toPlayerId)
			: null
		const contact = contactRef
			? ((await transaction.get(contactRef)).data() as
					PlayerContactDocument | undefined)
			: undefined

		const current = mail.delivery
			? { status: mail.delivery.status, at: mail.delivery.at.toDate() }
			: undefined
		if (!supersedes(current, report)) return 'stale'

		const delivery: MailDelivery = {
			status: report.status,
			at: Timestamp.fromDate(report.at),
			...(report.detail ? { detail: report.detail } : {}),
		}
		transaction.update(mailRef, { delivery })

		// Only while the player's address is still the one that failed: an
		// admin who has since changed it has fixed the problem.
		if (contactRef && contact?.email?.toLowerCase() === report.to) {
			actOnAddress(transaction, contactRef, mail, report)
		}
		return 'recorded'
	})
}

function actOnAddress(
	transaction: Transaction,
	contactRef: FirebaseFirestore.DocumentReference,
	mail: MailDocument,
	report: DeliveryReport
): void {
	if (report.undeliverable) {
		const undeliverable: EmailUndeliverable = {
			address: report.to,
			reason: report.status === 'suppressed' ? 'suppressed' : 'bounced',
			detail: report.detail ?? '',
			at: Timestamp.fromDate(report.at),
		}
		transaction.update(contactRef, { emailUndeliverable: undeliverable })
	}
	if (report.status === 'complained' && isOptionalCategory(mail.category)) {
		transaction.update(contactRef, {
			[`emailPreferences.${mail.category}`]: false,
			emailPreferencesUpdatedAt: FieldValue.serverTimestamp(),
		})
	}
}

/** Whether the contact's current address is flagged as undeliverable. */
export const isUndeliverable = (
	contact: Pick<PlayerContactDocument, 'email' | 'emailUndeliverable'>
): boolean =>
	Boolean(
		contact.emailUndeliverable &&
		contact.emailUndeliverable.address === contact.email?.toLowerCase()
	)
