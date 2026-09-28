import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import {
	contactOf,
	fakeResend,
	linkParams,
	seedEmailPlayer,
	setEmailMode,
} from './email-helpers.js'
import { emailUnsubscribe } from '../../Functions/src/index.js'
import { deliverQueuedEmail } from '../../Functions/src/email/sender.js'
import { mailDocument, mailRef } from '../../Functions/src/email/outbox.js'
import { playerContactRef } from '../../Functions/src/shared/database.js'
import type { EmailCategory } from '../../Functions/src/types.js'

/**
 * Unsubscribing, as the mailbox providers require it.
 *
 * - Gmail and Yahoo: a one-click `List-Unsubscribe` header (RFC 8058) on
 *   email a person can opt out of, honoured within two days.
 * - Yahoo and CAN-SPAM: a clearly visible link in the body, which may lead to
 *   a preferences page, with no login and nothing beyond a single page.
 * - RFC 8058: the POST works with no cookies or credentials, whatever body
 *   the mail app sends, and is never answered with a redirect.
 *
 * Every request here is one a mail app or a person could really send.
 */

const PLAYER = 'player-1'
const OTHER = 'player-2'

let firestore: Firestore

/** Runs the HTTP function as Hosting would call it. */
const request = async (
	method: string,
	query: Record<string, string>,
	body: unknown = undefined
): Promise<{
	status: number
	text: string
	location: string | null
	headers: Record<string, string>
}> => {
	const result = {
		status: 200,
		text: '',
		location: null as string | null,
		headers: {} as Record<string, string>,
	}
	const response = {
		status(code: number) {
			result.status = code
			return response
		},
		set(name: string, value: string) {
			result.headers[name.toLowerCase()] = value
			return response
		},
		type(value: string) {
			result.headers['content-type'] = value
			return response
		},
		send(content: string) {
			result.text = content
			return response
		},
		redirect(code: number, url: string) {
			result.status = code
			result.location = url
			return response
		},
	}
	await (
		emailUnsubscribe as unknown as (req: unknown, res: unknown) => Promise<void>
	)({ method, query, body, headers: {} }, response)
	return result
}

/** Sends a real (faked) email to the player and returns its one-click link. */
const oneClickLinkFor = async (
	playerId = PLAYER,
	category: EmailCategory = 'announcements'
): Promise<Record<string, string>> => {
	const ref = mailRef(firestore)
	await ref.set({
		...mailDocument({
			to: { playerId },
			template: 'seasonAnnouncement',
			props: {
				seasonName: '2026 Fall',
				registrationOpens: 'Thursday, October 1',
				registrationCloses: 'Saturday, October 31',
				gameNights: 'November 7, 14 and 21, and December 5, 12 and 19',
				skipsThanksgiving: true,
				teamSpots: 12,
				minimumSignedPlayers: 10,
			},
		}),
		category,
	})
	const resend = fakeResend()
	await deliverQueuedEmail(firestore, ref.id, resend)
	const header = resend.sent[0].email.headers['List-Unsubscribe']
	return linkParams(header.slice(1, -1))
}

const preferences = async (playerId = PLAYER) =>
	(await contactOf(firestore, playerId))?.emailPreferences

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await setEmailMode(firestore, 'live')
	await seedEmailPlayer(firestore, PLAYER)
	await seedEmailPlayer(firestore, OTHER)
})

describe('one-click unsubscribe (POST /unsubscribe)', () => {
	it('unsubscribes from the kind of email it came in', async () => {
		const link = await oneClickLinkFor()

		const response = await request('POST', link, {
			'List-Unsubscribe': 'One-Click',
		})

		expect(response.status).toBe(200)
		expect(await preferences()).toEqual({ announcements: false })
	})

	it('takes effect at once, well inside the two days Gmail and Yahoo allow', async () => {
		const link = await oneClickLinkFor()
		await request('POST', link, { 'List-Unsubscribe': 'One-Click' })

		// The next announcement to this player is not sent.
		const ref = mailRef(firestore)
		await ref.set(
			mailDocument({
				to: { playerId: PLAYER },
				template: 'seasonAnnouncement',
				props: {} as never,
			})
		)
		const resend = fakeResend()
		expect(await deliverQueuedEmail(firestore, ref.id, resend)).toBe(
			'unsubscribed'
		)
		expect(resend.sent).toHaveLength(0)
	})

	it('records when the player changed their preferences', async () => {
		const link = await oneClickLinkFor()
		await request('POST', link, { 'List-Unsubscribe': 'One-Click' })

		expect(
			(await contactOf(firestore, PLAYER))?.emailPreferencesUpdatedAt
		).toBeDefined()
	})

	it('never answers with a redirect, which RFC 8058 forbids here', async () => {
		const link = await oneClickLinkFor()

		const response = await request('POST', link, {
			'List-Unsubscribe': 'One-Click',
		})

		expect(response.status).toBeLessThan(300)
		expect(response.location).toBeNull()
	})

	it.each([
		[
			'form-encoded, as most mail apps send it',
			{ 'List-Unsubscribe': 'One-Click' },
		],
		[
			'multipart, which RFC 8058 recommends and Express leaves unparsed',
			Buffer.from(
				'--x\r\nContent-Disposition: form-data; name="List-Unsubscribe"\r\n\r\nOne-Click\r\n--x--\r\n'
			),
		],
		['with an empty body', undefined],
	])('works with a body %s', async (_label, body) => {
		const link = await oneClickLinkFor()

		expect((await request('POST', link, body)).status).toBe(200)
		expect(await preferences()).toEqual({ announcements: false })
	})

	it('needs no cookies, sign-in or anything but the link', async () => {
		const link = await oneClickLinkFor()

		// The request above carries no headers at all: no cookie, no
		// authorization, no session.
		expect((await request('POST', link)).status).toBe(200)
	})

	it('is harmless to repeat, as a double tap or a retrying mail app would', async () => {
		const link = await oneClickLinkFor()

		expect((await request('POST', link)).status).toBe(200)
		expect((await request('POST', link)).status).toBe(200)
		expect(await preferences()).toEqual({ announcements: false })
	})

	it('turns off only that kind of email', async () => {
		const link = await oneClickLinkFor(PLAYER, 'teams')

		await request('POST', link)

		expect(await preferences()).toEqual({ teams: false })
	})

	it('refuses a token that is not the player’s, and changes nothing', async () => {
		const link = await oneClickLinkFor()

		const response = await request('POST', { ...link, t: 'guessed-token' })

		expect(response.status).toBe(400)
		expect(await preferences()).toBeUndefined()
	})

	it('refuses one player’s token used for another', async () => {
		const mine = await oneClickLinkFor(PLAYER)
		await oneClickLinkFor(OTHER)

		const response = await request('POST', { ...mine, p: OTHER })

		expect(response.status).toBe(400)
		expect(await preferences(OTHER)).toBeUndefined()
		expect(await preferences(PLAYER)).toBeUndefined()
	})

	it('refuses a player who has never been sent a link', async () => {
		expect(
			(await request('POST', { p: PLAYER, t: 'anything', c: 'teams' })).status
		).toBe(400)
	})

	it.each([
		['account email, which cannot be turned off', { c: 'account' }],
		['a kind of email that does not exist', { c: 'spam' }],
		['no player', { p: '' }],
		['no token', { t: '' }],
	])('refuses %s', async (_label, change) => {
		const link = await oneClickLinkFor()

		expect((await request('POST', { ...link, ...change })).status).toBe(400)
		expect(await preferences()).toBeUndefined()
	})

	it('is never cached', async () => {
		const link = await oneClickLinkFor()
		expect((await request('POST', link)).headers['cache-control']).toBe(
			'no-store'
		)
	})
})

describe('opening /unsubscribe in a browser (GET)', () => {
	it('sends the person to the preferences page, keeping the link', async () => {
		const link = await oneClickLinkFor()

		const response = await request('GET', link)

		expect(response.status).toBe(303)
		const target = new URL(response.location ?? '')
		expect(target.origin).toBe('https://mplswinterleague.com')
		expect(target.pathname).toBe('/email-preferences')
		expect(Object.fromEntries(target.searchParams)).toEqual(link)
	})

	it('changes nothing, so a link scanner cannot unsubscribe anyone', async () => {
		const link = await oneClickLinkFor()

		await request('GET', link)
		await request('HEAD', link)

		expect(await preferences()).toBeUndefined()
	})

	it('refuses other methods', async () => {
		const link = await oneClickLinkFor()
		expect((await request('PUT', link)).status).toBe(405)
		expect((await request('DELETE', link)).status).toBe(405)
	})
})

describe('what a preference stops', () => {
	/** Queues and delivers one email of `category` to the player. */
	const deliver = async (category: EmailCategory, template = 'testEmail') => {
		const ref = mailRef(firestore)
		await ref.set({
			...mailDocument({
				to: { playerId: PLAYER },
				template: template as 'testEmail',
				props: { message: 'hello' },
			}),
			category,
		})
		return await deliverQueuedEmail(firestore, ref.id, fakeResend())
	}

	const turnOff = (changes: Record<string, boolean>) =>
		playerContactRef(firestore, PLAYER).set(
			{ emailPreferences: changes },
			{ merge: true }
		)

	it.each(['announcements', 'registration', 'teams'] as const)(
		'stops %s email when it is turned off',
		async (category) => {
			await turnOff({ [category]: false })
			expect(await deliver(category)).toBe('unsubscribed')
		}
	)

	it('leaves the other kinds alone', async () => {
		await turnOff({ announcements: false })

		expect(await deliver('teams')).toBe('sent')
		expect(await deliver('registration')).toBe('sent')
	})

	it('still sends account email with everything else turned off', async () => {
		await turnOff({ announcements: false, registration: false, teams: false })

		expect(await deliver('account')).toBe('sent')
	})

	it('sends again once a kind is turned back on', async () => {
		await turnOff({ teams: false })
		await turnOff({ teams: true })

		expect(await deliver('teams')).toBe('sent')
	})

	it('gives account email no unsubscribe header or link', async () => {
		const ref = mailRef(firestore)
		await ref.set(
			mailDocument({
				to: { playerId: PLAYER },
				template: 'testEmail',
				props: { message: 'hello' },
			})
		)
		const resend = fakeResend()
		await deliverQueuedEmail(firestore, ref.id, resend)

		expect(resend.sent[0].email.headers).toEqual({})
		expect(resend.sent[0].email.html).not.toContain('Unsubscribe')
	})

	it('keeps each player’s link the same across emails, so old links keep working', async () => {
		const first = await oneClickLinkFor()
		const second = await oneClickLinkFor()

		expect(second.t).toBe(first.t)
		expect((await request('POST', first)).status).toBe(200)
	})
})
