import { createHmac, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import { contactOf, seedEmailPlayer, setEmailMode } from './email-helpers.js'
import { resendWebhook } from '../../Functions/src/index.js'
import { deliverQueuedEmail } from '../../Functions/src/email/sender.js'
import { mailDocument, mailRef } from '../../Functions/src/email/outbox.js'
import { TEMPLATES } from '../../Functions/src/email/templates.js'
import type { EmailCategory } from '../../Functions/src/types.js'

/**
 * Resend's delivery reports, as its webhook sends them: signed the Standard
 * Webhooks way, one event per request. They record what became of each
 * email, stop the league mailing addresses that bounce for good, and honour
 * spam complaints.
 */

const PLAYER = 'player-1'
const ADDRESS = 'pat@example.com'
const SECRET = `whsec_${randomBytes(24).toString('base64')}`

let firestore: Firestore
let savedSecret: string | undefined

/** Signs a body as Resend does: HMAC-SHA256 over id, timestamp and body. */
const sign = (id: string, timestamp: string, body: string, secret = SECRET) =>
	`v1,${createHmac(
		'sha256',
		Buffer.from(secret.slice('whsec_'.length), 'base64')
	)
		.update(`${id}.${timestamp}.${body}`)
		.digest('base64')}`

interface Sent {
	status: number
	text: string
}

/** Runs the HTTP function as Hosting would call it. */
const post = async (
	body: unknown,
	options: {
		method?: string
		secret?: string
		timestamp?: number
		headers?: Record<string, string>
	} = {}
): Promise<Sent> => {
	const raw = JSON.stringify(body)
	const id = `msg_${randomBytes(6).toString('hex')}`
	const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000))
	const headers = options.headers ?? {
		'svix-id': id,
		'svix-timestamp': timestamp,
		'svix-signature': sign(id, timestamp, raw, options.secret),
	}
	const result: Sent = { status: 200, text: '' }
	const response = {
		status(code: number) {
			result.status = code
			return response
		},
		set() {
			return response
		},
		send(text: string) {
			result.text = text
			return response
		},
	}
	await (
		resendWebhook as unknown as (req: unknown, res: unknown) => Promise<void>
	)(
		{
			method: options.method ?? 'POST',
			headers,
			rawBody: Buffer.from(raw),
			body,
		},
		response
	)
	return result
}

/** A report about `emailId`, going to `to`. */
const report = (
	type: string,
	emailId: string,
	extra: Record<string, unknown> = {},
	options: { to?: string; at?: string } = {}
) => ({
	type,
	created_at: options.at ?? new Date().toISOString(),
	data: {
		email_id: emailId,
		created_at: new Date().toISOString(),
		message_id: '<m@resend>',
		from: 'Minneapolis Winter League <notifications@mplswinterleague.com>',
		to: [options.to ?? ADDRESS],
		subject: 'Hello',
		...extra,
	},
})

const PERMANENT = {
	bounce: {
		type: 'Permanent',
		subType: 'General',
		message: 'The email account does not exist.',
	},
}

/** A mail document as the sender leaves one after sending it. */
const sentMail = async (
	providerId: string,
	category: EmailCategory = 'teams',
	playerId = PLAYER
): Promise<string> => {
	const ref = mailRef(firestore)
	await ref.set({
		...mailDocument({
			to: { playerId },
			template: 'teamInvitation',
			props: TEMPLATES.teamInvitation.sample,
		}),
		category,
		status: 'sent',
		providerId,
	})
	return ref.id
}

const mailOf = async (id: string) =>
	(await firestore.collection('mail').doc(id).get()).data()

beforeAll(() => {
	firestore = initTestApp()
	savedSecret = process.env.RESEND_WEBHOOK_SECRET
	process.env.RESEND_WEBHOOK_SECRET = SECRET
})

afterAll(() => {
	if (savedSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET
	else process.env.RESEND_WEBHOOK_SECRET = savedSecret
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seedEmailPlayer(firestore, PLAYER, { email: ADDRESS })
})

describe('the signature', () => {
	it('accepts a report Resend signed', async () => {
		await sentMail('resend-1')
		expect((await post(report('email.delivered', 'resend-1'))).status).toBe(200)
	})

	it.each([
		[
			'signed with another secret',
			{ secret: `whsec_${randomBytes(24).toString('base64')}` },
		],
		['with no signature headers', { headers: {} }],
		[
			'signed more than five minutes ago',
			{ timestamp: Math.floor(Date.now() / 1000) - 600 },
		],
	])('refuses a report %s, and changes nothing', async (_label, options) => {
		const id = await sentMail('resend-1')

		const response = await post(
			report('email.bounced', 'resend-1', PERMANENT),
			options
		)

		expect(response.status).toBe(400)
		expect((await mailOf(id))?.delivery).toBeUndefined()
		expect(await contactOf(firestore, PLAYER)).not.toHaveProperty(
			'emailUndeliverable'
		)
	})

	it('refuses a body changed after signing', async () => {
		const id = await sentMail('resend-1')
		const signed = JSON.stringify(report('email.delivered', 'resend-1'))
		const idHeader = 'msg_1'
		const timestamp = String(Math.floor(Date.now() / 1000))

		const response = await post(
			report('email.bounced', 'resend-1', PERMANENT),
			{
				headers: {
					'svix-id': idHeader,
					'svix-timestamp': timestamp,
					'svix-signature': sign(idHeader, timestamp, signed),
				},
			}
		)

		expect(response.status).toBe(400)
		expect((await mailOf(id))?.delivery).toBeUndefined()
	})

	it('answers only POST', async () => {
		expect((await post({}, { method: 'GET' })).status).toBe(405)
	})
})

describe('recording delivery', () => {
	it('records delivery on the email it is about', async () => {
		const id = await sentMail('resend-1')
		const other = await sentMail('resend-2')

		await post(report('email.delivered', 'resend-1'))

		expect((await mailOf(id))?.delivery).toMatchObject({ status: 'delivered' })
		// The send status is left as it was.
		expect((await mailOf(id))?.status).toBe('sent')
		expect((await mailOf(other))?.delivery).toBeUndefined()
	})

	it('records a delay, then the delivery that follows', async () => {
		const id = await sentMail('resend-1')

		await post(report('email.delivery_delayed', 'resend-1'))
		expect((await mailOf(id))?.delivery?.status).toBe('delayed')

		await post(report('email.delivered', 'resend-1'))
		expect((await mailOf(id))?.delivery?.status).toBe('delivered')
	})

	it('keeps delivery when a stale delay arrives after it', async () => {
		const id = await sentMail('resend-1')
		await post(report('email.delivered', 'resend-1'))

		const response = await post(
			report(
				'email.delivery_delayed',
				'resend-1',
				{},
				{
					at: '2020-01-01T00:00:00.000Z',
				}
			)
		)

		expect(response.text).toBe('stale')
		expect((await mailOf(id))?.delivery?.status).toBe('delivered')
	})

	it('records a bounce with the receiving server’s message', async () => {
		const id = await sentMail('resend-1')

		await post(report('email.bounced', 'resend-1', PERMANENT))

		expect((await mailOf(id))?.delivery).toMatchObject({
			status: 'bounced',
			detail: 'The email account does not exist.',
		})
	})

	it('answers 200 for an email the league has no record of', async () => {
		// A test sent from the Resend dashboard, say: nothing to update, and
		// Resend must not keep retrying it.
		const response = await post(report('email.delivered', 'not-ours'))

		expect(response).toEqual({ status: 200, text: 'unknown-email' })
	})

	it('answers 200 and ignores events the league does not track', async () => {
		const id = await sentMail('resend-1')

		const response = await post(report('email.opened', 'resend-1'))

		expect(response).toEqual({ status: 200, text: 'Ignored' })
		expect((await mailOf(id))?.delivery).toBeUndefined()
	})

	it('is harmless to receive twice, as Resend may retry', async () => {
		const id = await sentMail('resend-1')
		const event = report('email.delivered', 'resend-1')

		await post(event)
		await post(event)

		expect((await mailOf(id))?.delivery?.status).toBe('delivered')
	})
})

describe('addresses that cannot receive email', () => {
	it('flags the player’s address after a permanent bounce', async () => {
		await sentMail('resend-1')

		await post(report('email.bounced', 'resend-1', PERMANENT))

		expect(
			(await contactOf(firestore, PLAYER))?.emailUndeliverable
		).toMatchObject({
			address: ADDRESS,
			reason: 'bounced',
			detail: 'The email account does not exist.',
		})
	})

	it('flags it when Resend blocks an address that bounced before', async () => {
		await sentMail('resend-1')

		await post(
			report('email.suppressed', 'resend-1', {
				suppressed: { type: 'bounce', message: 'On the suppression list.' },
			})
		)

		expect(
			(await contactOf(firestore, PLAYER))?.emailUndeliverable
		).toMatchObject({
			reason: 'suppressed',
		})
	})

	it('gives the address another chance after a temporary bounce', async () => {
		await sentMail('resend-1')

		await post(
			report('email.bounced', 'resend-1', {
				bounce: { type: 'Transient', subType: 'MailboxFull', message: 'Full' },
			})
		)

		expect(await contactOf(firestore, PLAYER)).not.toHaveProperty(
			'emailUndeliverable'
		)
	})

	it('leaves the player alone if an admin has already changed the address', async () => {
		await sentMail('resend-1')
		await firestore
			.collection('playerContacts')
			.doc(PLAYER)
			.update({ email: 'pat@new.example.com' })

		await post(report('email.bounced', 'resend-1', PERMANENT))

		expect(await contactOf(firestore, PLAYER)).not.toHaveProperty(
			'emailUndeliverable'
		)
	})

	it('stops sending to the flagged address', async () => {
		await setEmailMode(firestore, 'live')
		await sentMail('resend-1')
		await post(report('email.bounced', 'resend-1', PERMANENT))
		const next = mailRef(firestore)
		await next.create(
			mailDocument({
				to: { playerId: PLAYER },
				template: 'teamInvitation',
				props: TEMPLATES.teamInvitation.sample,
			})
		)
		const sent: unknown[] = []

		const status = await deliverQueuedEmail(
			firestore,
			next.id,
			async (email) => {
				sent.push(email)
				return { ok: true, id: 'resend-2' }
			}
		)

		expect(status).toBe('undeliverable')
		expect(sent).toHaveLength(0)
		expect((await mailOf(next.id))?.reason).toMatch(/player management/)
	})

	it('sends again once an admin changes the address', async () => {
		await setEmailMode(firestore, 'live')
		await sentMail('resend-1')
		await post(report('email.bounced', 'resend-1', PERMANENT))
		await firestore
			.collection('playerContacts')
			.doc(PLAYER)
			.update({ email: 'pat@new.example.com' })
		const next = mailRef(firestore)
		await next.create(
			mailDocument({
				to: { playerId: PLAYER },
				template: 'teamInvitation',
				props: TEMPLATES.teamInvitation.sample,
			})
		)
		const sentTo: string[] = []

		const status = await deliverQueuedEmail(
			firestore,
			next.id,
			async (email) => {
				sentTo.push(email.to)
				return { ok: true, id: 'resend-3' }
			}
		)

		expect(status).toBe('sent')
		expect(sentTo).toEqual(['pat@new.example.com'])
	})
})

describe('spam complaints', () => {
	it('turns off the kind of email the player marked as spam', async () => {
		await sentMail('resend-1', 'announcements')

		await post(report('email.complained', 'resend-1'))

		expect((await contactOf(firestore, PLAYER))?.emailPreferences).toEqual({
			announcements: false,
		})
	})

	it('leaves the player’s other kinds of email on', async () => {
		await sentMail('resend-1', 'teams')

		await post(report('email.complained', 'resend-1'))

		expect((await contactOf(firestore, PLAYER))?.emailPreferences).toEqual({
			teams: false,
		})
	})

	it('cannot turn off account email', async () => {
		await sentMail('resend-1', 'account')

		await post(report('email.complained', 'resend-1'))

		expect(await contactOf(firestore, PLAYER)).not.toHaveProperty(
			'emailPreferences'
		)
	})

	it('records the complaint on the email, over its delivery', async () => {
		const id = await sentMail('resend-1', 'announcements')
		await post(report('email.delivered', 'resend-1'))

		await post(report('email.complained', 'resend-1'))

		expect((await mailOf(id))?.delivery?.status).toBe('complained')
	})
})
