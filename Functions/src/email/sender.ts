/**
 * Sends one queued email, or records why it was not sent. Called by the
 * `sendQueuedEmail` trigger; the provider is passed in so tests can stand
 * in for Resend.
 *
 * Idempotent: an email that is no longer `queued` is left alone, and the
 * mail id is the provider's idempotency key, so a retry after a send that
 * succeeded but was not recorded is not delivered twice.
 */

import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { EMAIL_CONFIG } from '../config/constants.js'
import { isRunningInEmulator } from '../config/environment.js'
import { playerContactRef, playerRef } from '../shared/database.js'
import { Collections, type MailDocument, type MailStatus } from '../types.js'
import { renderEmail, type RenderedEmail } from './render.js'
import { deliveryFor, readEmailSettings } from './settings.js'
import { isTemplateName, type TemplateName } from './templates.js'
import {
	isOptionalCategory,
	preferenceLinks,
	preferencesOf,
	type EmailPreferences,
} from './unsubscribe.js'

export interface OutgoingEmail {
	to: string
	subject: string
	html: string
	text: string
	headers: Record<string, string>
	tags: { name: string; value: string }[]
}

export type SendResult =
	{ ok: true; id: string } | { ok: false; retryable: boolean; message: string }

/** Sends through the provider, keyed by `idempotencyKey`. */
export type SendEmail = (
	email: OutgoingEmail,
	idempotencyKey: string
) => Promise<SendResult>

/** Thrown so the trigger retries: the failure may pass. */
export class RetryableEmailError extends Error {}

export async function deliverQueuedEmail(
	firestore: Firestore,
	mailId: string,
	send: SendEmail
): Promise<MailStatus> {
	const ref = firestore.collection(Collections.MAIL).doc(mailId)
	const mail = (await ref.get()).data() as MailDocument | undefined
	if (!mail || mail.status !== 'queued') return mail?.status ?? 'failed'

	const finish = async (
		status: MailStatus,
		fields: Partial<MailDocument> = {}
	): Promise<MailStatus> => {
		await ref.update({ status, ...fields })
		return status
	}

	if (!isTemplateName(mail.template)) {
		return finish('failed', { reason: `Unknown template "${mail.template}".` })
	}

	const recipient = await resolveRecipient(firestore, mail)
	if (!recipient) {
		return finish('failed', { reason: 'The recipient has no email address.' })
	}
	if (
		isOptionalCategory(mail.category) &&
		!recipient.preferences[mail.category]
	) {
		return finish('unsubscribed', {
			reason: `Unsubscribed from ${mail.category}.`,
		})
	}

	const delivery = deliveryFor(
		await readEmailSettings(firestore),
		recipient.address
	)
	if (!delivery.send) {
		return finish(delivery.status, { reason: delivery.reason })
	}
	if (mail.category === 'announcements' && !EMAIL_CONFIG.POSTAL_ADDRESS) {
		return finish('failed', {
			reason:
				'Announcements need the league’s postal address (EMAIL_CONFIG.POSTAL_ADDRESS).',
		})
	}

	// Email a player can turn off links to their preferences in the footer
	// and offers mail apps one-click unsubscribe in its headers.
	const links =
		mail.toPlayerId && isOptionalCategory(mail.category)
			? await preferenceLinks(firestore, mail.toPlayerId, mail.category)
			: null
	const rendered = await renderEmail(
		mail.template as TemplateName,
		mail.props as never,
		{
			recipientFirstName: recipient.firstName,
			unsubscribeUrl: links?.page ?? null,
		}
	)

	// The emulator reads production secrets, and Resend has no test mode:
	// under it, an email is rendered and recorded, never sent.
	if (isRunningInEmulator()) {
		return finish('emulated', { reason: 'Not sent: running in the emulator.' })
	}

	const result = await send(
		outgoing(recipient.address, rendered, mail, links?.oneClick ?? null),
		mailId
	)
	if (result.ok) {
		return finish('sent', {
			providerId: result.id,
			sentAt: FieldValue.serverTimestamp() as never,
			attempts: mail.attempts + 1,
		})
	}
	if (result.retryable) {
		await ref.update({ attempts: mail.attempts + 1, reason: result.message })
		throw new RetryableEmailError(
			`Email ${mailId} not sent, will retry: ${result.message}`
		)
	}
	logger.error('Email could not be sent', { mailId, reason: result.message })
	return finish('failed', {
		reason: result.message,
		attempts: mail.attempts + 1,
	})
}

interface ResolvedRecipient {
	address: string
	firstName: string | null
	preferences: EmailPreferences
}

async function resolveRecipient(
	firestore: Firestore,
	mail: MailDocument
): Promise<ResolvedRecipient | null> {
	if (mail.toAddress) {
		return {
			address: mail.toAddress,
			firstName: null,
			preferences: preferencesOf(undefined),
		}
	}
	if (!mail.toPlayerId) return null
	const [contact, player] = await Promise.all([
		playerContactRef(firestore, mail.toPlayerId).get(),
		playerRef(firestore, mail.toPlayerId).get(),
	])
	const address = contact.data()?.email
	if (!address) return null
	return {
		address,
		firstName: player.data()?.firstname ?? null,
		preferences: preferencesOf(contact.data()),
	}
}

function outgoing(
	to: string,
	rendered: RenderedEmail,
	mail: MailDocument,
	oneClick: string | null
): OutgoingEmail {
	return {
		to,
		subject: rendered.subject,
		html: rendered.html,
		text: rendered.text,
		// One-click unsubscribe (RFC 8058), which Gmail and Yahoo expect of
		// anything a person can opt out of.
		headers: oneClick
			? {
					'List-Unsubscribe': `<${oneClick}>`,
					'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
				}
			: {},
		tags: [
			{ name: 'category', value: mail.category },
			{ name: 'template', value: mail.template },
		],
	}
}
