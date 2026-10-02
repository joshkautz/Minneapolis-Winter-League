import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
} from './helpers.js'
import {
	sendEmailPreview,
	sendSeasonAnnouncement,
} from '../../Functions/src/index.js'
import { EMAIL_CONFIG } from '../../Functions/src/config/constants.js'
import {
	deliverQueuedEmail,
	RetryableEmailError,
	type OutgoingEmail,
	type SendEmail,
	type SendResult,
} from '../../Functions/src/email/sender.js'
import {
	mailDocument,
	mailRef,
	queueEmail,
} from '../../Functions/src/email/outbox.js'
import {
	TEMPLATES,
	type TemplateName,
} from '../../Functions/src/email/templates.js'
import {
	playerContactRef,
	teamRosterEntryRef,
} from '../../Functions/src/shared/database.js'

/**
 * Email, end to end against the emulator, with a stand-in for Resend. The
 * trigger that calls `deliverQueuedEmail` is not running here, so nothing
 * leaves the machine.
 */

const ADMIN = 'admin-1'
const PLAYER = 'player-1'
const JOSH = 'josh@mplsmallard.com'

let firestore: Firestore
const postal = EMAIL_CONFIG as { POSTAL_ADDRESS: string | null }
const LEAGUE_ADDRESS = postal.POSTAL_ADDRESS

/** Records every send, answering with `result`. */
const fakeResend = (
	result: SendResult = { ok: true, id: 'resend-1' }
): SendEmail & { sent: { email: OutgoingEmail; key: string }[] } => {
	const sent: { email: OutgoingEmail; key: string }[] = []
	const send = (async (email: OutgoingEmail, key: string) => {
		sent.push({ email, key })
		return result
	}) as SendEmail & { sent: typeof sent }
	send.sent = sent
	return send
}

const setEmail = (mode: 'off' | 'test' | 'live', testRecipients = [JOSH]) =>
	firestore.doc('system/email').set({ mode, testRecipients })

const mail = async (id: string) =>
	(await firestore.collection('mail').doc(id).get()).data()

const queueToPlayer = async () =>
	(
		await queueEmail(firestore, {
			to: { playerId: PLAYER },
			template: 'seasonAnnouncement',
			props: {
				seasonName: 'Season 5',
				registrationOpens: 'Thursday, October 1',
				registrationCloses: 'Saturday, October 31',
				gameNights: 'November 7, 14 and 21, and December 5, 12 and 19',
				skipsThanksgiving: true,
				teamSpots: 12,
				minimumSignedPlayers: 10,
			},
		})
	).id

const seedPlayer = async (
	id: string,
	options: { email?: string | null; banned?: boolean; admin?: boolean } = {}
) => {
	await firestore
		.collection('players')
		.doc(id)
		.set({
			firstname: `First${id}`,
			lastname: 'Player',
			admin: options.admin ?? false,
			banned: options.banned ?? false,
		})
	if (options.email !== null) {
		await playerContactRef(firestore, id).set({
			email: options.email ?? `${id}@example.com`,
		})
	}
}

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seedPlayer(ADMIN, { admin: true })
	await seedPlayer(PLAYER, { email: 'player-1@example.com' })
	postal.POSTAL_ADDRESS = LEAGUE_ADDRESS
})

afterEach(() => {
	postal.POSTAL_ADDRESS = LEAGUE_ADDRESS
	delete process.env.FUNCTIONS_EMULATOR
})

describe('deliverQueuedEmail', () => {
	it('holds everything while email is off, which it is by default', async () => {
		const id = await queueToPlayer()
		const resend = fakeResend()

		expect(await deliverQueuedEmail(firestore, id, resend)).toBe('held')
		expect(resend.sent).toHaveLength(0)
	})

	it('in test mode, sends only to test recipients', async () => {
		await setEmail('test')
		const id = await queueToPlayer()
		const resend = fakeResend()

		expect(await deliverQueuedEmail(firestore, id, resend)).toBe('skipped')
		expect(resend.sent).toHaveLength(0)

		const toJosh = (
			await queueEmail(firestore, {
				to: { address: JOSH },
				template: 'testEmail',
				props: { message: 'hello' },
			})
		).id
		expect(await deliverQueuedEmail(firestore, toJosh, resend)).toBe('sent')
		expect(resend.sent[0].email.to).toBe(JOSH)
	})

	it('when live, sends to the player with the mail id as the idempotency key', async () => {
		await setEmail('live')
		const id = await queueToPlayer()
		const resend = fakeResend()

		expect(await deliverQueuedEmail(firestore, id, resend)).toBe('sent')

		expect(resend.sent).toHaveLength(1)
		const [{ email, key }] = resend.sent
		expect(key).toBe(id)
		expect(email.to).toBe('player-1@example.com')
		expect(email.subject).toBe(
			'Season 5 registration opens Thursday, October 1'
		)
		expect(email.text).toContain('Hi Firstplayer-1,')
		expect((await mail(id))?.providerId).toBe('resend-1')
	})

	it('puts a one-click unsubscribe on an announcement, pointing at the site', async () => {
		await setEmail('live')
		const id = await queueToPlayer()
		const resend = fakeResend()

		await deliverQueuedEmail(firestore, id, resend)

		const { headers, html, text } = resend.sent[0].email
		expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
		// Exactly one URI, HTTPS, in angle brackets (RFC 8058).
		expect(headers['List-Unsubscribe']).toMatch(
			/^<https:\/\/mplswinterleague\.com\/unsubscribe\?p=player-1&t=[\w-]+&c=announcements>$/
		)
		// The visible link opens the preferences page, with the same token.
		const token = new URL(
			headers['List-Unsubscribe'].slice(1, -1)
		).searchParams.get('t')
		expect(text).toContain(
			`https://mplswinterleague.com/email-preferences?p=player-1&t=${token}&c=announcements`
		)
		expect(html).toContain('4316 Glencrest Road, Golden Valley, MN 55416')
	})

	it('never sends an email twice', async () => {
		await setEmail('live')
		const id = await queueToPlayer()
		const resend = fakeResend()

		await deliverQueuedEmail(firestore, id, resend)
		await deliverQueuedEmail(firestore, id, resend)

		expect(resend.sent).toHaveLength(1)
	})

	it('does not send to a player who unsubscribed from that kind of email', async () => {
		await setEmail('live')
		await playerContactRef(firestore, PLAYER).set(
			{ emailPreferences: { announcements: false } },
			{ merge: true }
		)
		const id = await queueToPlayer()
		const resend = fakeResend()

		expect(await deliverQueuedEmail(firestore, id, resend)).toBe('unsubscribed')
		expect(resend.sent).toHaveLength(0)
	})

	it('refuses an announcement without the postal address CAN-SPAM requires', async () => {
		await setEmail('live')
		postal.POSTAL_ADDRESS = null
		const id = await queueToPlayer()
		const resend = fakeResend()

		expect(await deliverQueuedEmail(firestore, id, resend)).toBe('failed')
		expect(resend.sent).toHaveLength(0)
	})

	it('fails an email to a player with no address', async () => {
		await setEmail('live')
		await playerContactRef(firestore, PLAYER).delete()
		const id = await queueToPlayer()

		expect(await deliverQueuedEmail(firestore, id, fakeResend())).toBe('failed')
	})

	it('throws, so the trigger retries, on a failure that may pass', async () => {
		await setEmail('live')
		const id = await queueToPlayer()
		const resend = fakeResend({
			ok: false,
			retryable: true,
			message: 'rate_limit_exceeded',
		})

		await expect(deliverQueuedEmail(firestore, id, resend)).rejects.toThrow(
			RetryableEmailError
		)
		expect(await mail(id)).toMatchObject({ status: 'queued', attempts: 1 })
	})

	it('gives up on a failure that will not pass', async () => {
		await setEmail('live')
		const id = await queueToPlayer()
		const resend = fakeResend({
			ok: false,
			retryable: false,
			message: 'validation_error: bad address',
		})

		expect(await deliverQueuedEmail(firestore, id, resend)).toBe('failed')
		expect((await mail(id))?.reason).toContain('bad address')
	})

	it('never sends from the emulator, which reads production secrets', async () => {
		await setEmail('live')
		process.env.FUNCTIONS_EMULATOR = 'true'
		const id = await queueToPlayer()
		const resend = fakeResend()

		expect(await deliverQueuedEmail(firestore, id, resend)).toBe('emulated')
		expect(resend.sent).toHaveLength(0)
	})
})

describe('banned players', () => {
	// A banned player is never emailed: an invitation, a team update or an
	// announcement would all suggest they can still play.
	const BANNED = 'banned-player'

	/** Queues `template`'s sample to the banned player. */
	const queueTo = async (
		playerId: string,
		template: TemplateName
	): Promise<string> => {
		const ref = mailRef(firestore)
		await ref.create(
			mailDocument({
				to: { playerId },
				template,
				props: TEMPLATES[template].sample as never,
			})
		)
		return ref.id
	}

	const mailOf = async (id: string) =>
		(await firestore.collection('mail').doc(id).get()).data()

	beforeEach(async () => {
		await setEmail('live')
		await seedPlayer(BANNED, { banned: true })
	})

	it.each(Object.keys(TEMPLATES) as TemplateName[])(
		'never sends a banned player %s',
		async (template) => {
			const id = await queueTo(BANNED, template)
			const resend = fakeResend()

			expect(await deliverQueuedEmail(firestore, id, resend)).toBe('banned')

			expect(resend.sent).toHaveLength(0)
			expect(await mailOf(id)).toMatchObject({
				status: 'banned',
				reason: 'The player is banned from the league.',
			})
		}
	)

	it('stops email queued before the player was banned', async () => {
		const id = await queueTo(PLAYER, 'teamInvitation')
		await firestore.doc(`players/${PLAYER}`).update({ banned: true })
		const resend = fakeResend()

		expect(await deliverQueuedEmail(firestore, id, resend)).toBe('banned')
		expect(resend.sent).toHaveLength(0)
	})

	it('gives a banned player no unsubscribe link either', async () => {
		// Making one would write a token to their contact document.
		await deliverQueuedEmail(
			firestore,
			await queueTo(BANNED, 'seasonAnnouncement'),
			fakeResend()
		)

		expect(
			(await playerContactRef(firestore, BANNED).get()).data()
		).not.toHaveProperty('unsubscribeToken')
	})

	it('emails the player again once the ban is lifted', async () => {
		await firestore.doc(`players/${BANNED}`).update({ banned: false })
		const resend = fakeResend()

		expect(
			await deliverQueuedEmail(
				firestore,
				await queueTo(BANNED, 'teamInvitation'),
				resend
			)
		).toBe('sent')
		expect(resend.sent).toHaveLength(1)
	})
})

describe('sendSeasonAnnouncement', () => {
	const SEASON = 'season-1'

	const seedSeason = () =>
		firestore
			.collection('seasons')
			.doc(SEASON)
			.set({
				name: 'Season 5',
				dateStart: Timestamp.fromDate(new Date('2026-11-07T06:00:00Z')),
				dateEnd: Timestamp.fromDate(new Date('2026-12-20T06:00:00Z')),
				registrationStart: Timestamp.fromDate(new Date('2026-10-01T05:00:00Z')),
				registrationEnd: Timestamp.fromDate(new Date('2026-11-01T04:59:00Z')),
				teamRegistrationTotalCents: 100_000,
			})

	const rostered = async (playerId: string, season = 'season-0') => {
		await teamRosterEntryRef(firestore, 'team-1', season, playerId).set({
			player: firestore.collection('players').doc(playerId),
			dateJoined: Timestamp.now(),
		})
	}

	const announce = (data: Record<string, unknown>) =>
		errorCodeFrom(sendSeasonAnnouncement, { auth: authed(ADMIN), data })

	const run = async (data: Record<string, unknown>) =>
		(await (
			sendSeasonAnnouncement as unknown as {
				run: (r: unknown) => Promise<Record<string, number>>
			}
		).run({ auth: authed(ADMIN), data })) as Record<string, number>

	const queued = async () =>
		(await firestore.collection('mail').get()).docs.map((doc) => doc.data())

	beforeEach(async () => {
		await seedSeason()
		await rostered(PLAYER)
		await seedPlayer('old-timer')
		await rostered('old-timer', 'season-2023')
		await seedPlayer('banned-1', { banned: true })
		await rostered('banned-1')
		await seedPlayer('no-email', { email: null })
		await rostered('no-email')
		// Signed up, never on a roster: not someone who has played.
		await seedPlayer('never-played')
	})

	it('counts everyone who has ever played, without queueing, on a dry run', async () => {
		const result = await run({
			seasonId: SEASON,
			audience: 'players',
			dryRun: true,
		})

		expect(result.recipients).toBe(2)
		expect(await queued()).toHaveLength(0)
	})

	it('refuses to email players until email is live', async () => {
		await setEmail('test')

		expect(await announce({ seasonId: SEASON, audience: 'players' })).toBe(
			'failed-precondition'
		)
		expect(await queued()).toHaveLength(0)
	})

	it('refuses to email players without the postal address', async () => {
		await setEmail('live')
		postal.POSTAL_ADDRESS = null

		expect(await announce({ seasonId: SEASON, audience: 'players' })).toBe(
			'failed-precondition'
		)
	})

	it('queues one announcement per player, however often it is sent', async () => {
		await setEmail('live')

		const first = await run({ seasonId: SEASON, audience: 'players' })
		const second = await run({ seasonId: SEASON, audience: 'players' })

		expect(first).toMatchObject({ recipients: 2, queued: 2, alreadyQueued: 0 })
		expect(second).toMatchObject({ queued: 0, alreadyQueued: 2 })
		const mails = await queued()
		expect(mails.map((m) => m.toPlayerId).sort()).toEqual(['old-timer', PLAYER])
		expect(mails[0].props).toMatchObject({
			seasonName: 'Season 5',
			registrationOpens: 'Thursday, October 1',
			registrationCloses: 'Saturday, October 31',
			gameNights: 'November 7, 14 and 21, and December 5, 12 and 19',
			skipsThanksgiving: true,
		})
		expect(mails[0].props).not.toHaveProperty('teamFee')
	})

	it('sends only to the test recipients when asked', async () => {
		await setEmail('test')

		await run({ seasonId: SEASON, audience: 'test' })

		const mails = await queued()
		expect(mails.map((m) => m.toAddress)).toEqual([JOSH])
	})

	it('refuses a test send while email is off', async () => {
		expect(await announce({ seasonId: SEASON, audience: 'test' })).toBe(
			'failed-precondition'
		)
	})
})

describe('sendEmailPreview', () => {
	it('queues a template to each test recipient', async () => {
		await setEmail('test', [JOSH, 'second@example.com'])

		expect(
			await errorCodeFrom(sendEmailPreview, {
				auth: authed(ADMIN),
				data: { template: 'seasonAnnouncement' },
			})
		).toBeNull()

		const mails = (await firestore.collection('mail').get()).docs.map((d) =>
			d.data()
		)
		expect(mails.map((m) => m.toAddress).sort()).toEqual([
			JOSH,
			'second@example.com',
		])
	})

	it('refuses a template that does not exist', async () => {
		await setEmail('test')
		expect(
			await errorCodeFrom(sendEmailPreview, {
				auth: authed(ADMIN),
				data: { template: 'nope' },
			})
		).toBe('invalid-argument')
	})
})
