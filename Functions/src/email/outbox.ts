/**
 * Queueing email. Code that wants an email sent writes a `mail/{id}`
 * document — in the same transaction as the change the email describes,
 * where there is one — and the `sendQueuedEmail` trigger sends it. So an
 * email goes out only if the change it announces was saved, and a retry
 * cannot send it twice.
 */

import {
	FieldValue,
	type DocumentReference,
	type Firestore,
	type Transaction,
} from 'firebase-admin/firestore'
import { Collections, type MailDocument } from '../types.js'
import {
	TEMPLATES,
	type TemplateName,
	type TemplateProps,
} from './templates.js'

export type Recipient = { playerId: string } | { address: string }

export interface QueuedEmail<Name extends TemplateName> {
	to: Recipient
	template: Name
	props: TemplateProps<Name>
	/**
	 * A stable id makes queueing idempotent: queueing the same email twice
	 * fails the second time instead of sending it again.
	 */
	id?: string
}

export function mailRef(firestore: Firestore, id?: string): DocumentReference {
	const mail = firestore.collection(Collections.MAIL)
	return id ? mail.doc(id) : mail.doc()
}

/** The document to create for an email. */
export function mailDocument<Name extends TemplateName>(
	email: QueuedEmail<Name>
): Omit<MailDocument, 'createdAt'> & { createdAt: FieldValue } {
	return {
		toPlayerId: 'playerId' in email.to ? email.to.playerId : null,
		toAddress: 'address' in email.to ? email.to.address.toLowerCase() : null,
		template: email.template,
		props: email.props as Record<string, unknown>,
		category: TEMPLATES[email.template].category,
		status: 'queued',
		createdAt: FieldValue.serverTimestamp(),
		attempts: 0,
	}
}

/** Queues an email inside a transaction. */
export function queueEmailInTransaction<Name extends TemplateName>(
	transaction: Transaction,
	firestore: Firestore,
	email: QueuedEmail<Name>
): DocumentReference {
	const ref = mailRef(firestore, email.id)
	transaction.create(ref, mailDocument(email))
	return ref
}

/** Firestore's code for creating a document that already exists. */
const ALREADY_EXISTS = 6

/**
 * Queues an email under a stable id at most once: a second attempt, by a
 * retried trigger say, changes nothing and says so.
 */
export async function queueEmailOnce<Name extends TemplateName>(
	firestore: Firestore,
	email: QueuedEmail<Name> & { id: string }
): Promise<'queued' | 'already-queued'> {
	try {
		await queueEmail(firestore, email)
		return 'queued'
	} catch (error) {
		if ((error as { code?: number }).code === ALREADY_EXISTS) {
			return 'already-queued'
		}
		throw error
	}
}

/** Queues an email on its own. */
export async function queueEmail<Name extends TemplateName>(
	firestore: Firestore,
	email: QueuedEmail<Name>
): Promise<DocumentReference> {
	const ref = mailRef(firestore, email.id)
	await ref.create(mailDocument(email))
	return ref
}
