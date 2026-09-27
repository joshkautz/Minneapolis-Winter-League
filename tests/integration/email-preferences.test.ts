import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	unverified,
} from './helpers.js'
import {
	contactOf,
	fakeResend,
	linkParams,
	seedEmailPlayer,
	setEmailMode,
} from './email-helpers.js'
import {
	getEmailPreferences,
	updateEmailPreferences,
} from '../../Functions/src/index.js'
import { deliverQueuedEmail } from '../../Functions/src/email/sender.js'
import { queueEmail } from '../../Functions/src/email/outbox.js'
import { unsubscribeTokenFor } from '../../Functions/src/email/unsubscribe.js'

/**
 * The callables behind the preferences page and the profile. A link from a
 * player's email opens them without signing in — CAN-SPAM forbids requiring
 * a login to opt out — and a signed-in player can reach their own; nobody
 * can reach anyone else's.
 */

const PLAYER = 'player-1'
const OTHER = 'player-2'
const ALL_ON = { announcements: true, registration: true, teams: true }

let firestore: Firestore
let token: string

type Callable = { run: (request: unknown) => Promise<unknown> }

const call = async (
	fn: unknown,
	data: Record<string, unknown>,
	auth: CallableRequest<never>['auth'] = undefined
) =>
	(await (fn as Callable).run({ auth, data })) as {
		email: string
		preferences: typeof ALL_ON
	}

const codeOf = (
	fn: unknown,
	data: Record<string, unknown>,
	auth: CallableRequest<never>['auth'] = undefined
) => errorCodeFrom(fn as never, { auth, data })

const withLink = (extra: Record<string, unknown> = {}) => ({
	playerId: PLAYER,
	token,
	...extra,
})

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seedEmailPlayer(firestore, PLAYER, { email: 'pat@example.com' })
	await seedEmailPlayer(firestore, OTHER)
	token = await unsubscribeTokenFor(firestore, PLAYER)
})

describe('getEmailPreferences', () => {
	it('opens with the link from an email, signed out', async () => {
		expect(await call(getEmailPreferences, withLink())).toEqual({
			email: 'p•••@example.com',
			preferences: ALL_ON,
		})
	})

	it('shows what the player has turned off', async () => {
		await call(
			updateEmailPreferences,
			withLink({ preferences: { registration: false } })
		)

		expect((await call(getEmailPreferences, withLink())).preferences).toEqual({
			...ALL_ON,
			registration: false,
		})
	})

	it('opens for the player signed in as themselves, without a link', async () => {
		expect((await call(getEmailPreferences, {}, authed(PLAYER))).email).toBe(
			'p•••@example.com'
		)
	})

	it('opens for a player whose email is not verified yet', async () => {
		expect(
			(await call(getEmailPreferences, {}, unverified(PLAYER))).preferences
		).toEqual(ALL_ON)
	})

	it('shows the link’s player even to someone signed in as another', async () => {
		// A shared computer: the link decides whose preferences these are.
		expect(
			(await call(getEmailPreferences, withLink(), authed(OTHER))).email
		).toBe('p•••@example.com')
	})

	it.each([
		['a wrong token', { playerId: PLAYER, token: 'guessed' }],
		['a token from another player’s link', { playerId: OTHER }],
		['a player but no token', { playerId: PLAYER, token: undefined }],
		['a token but no player', { playerId: undefined }],
		['a token that is not text', { token: 42 }],
	])('refuses %s', async (_label, change) => {
		expect(await codeOf(getEmailPreferences, withLink(change))).toBe(
			'permission-denied'
		)
	})

	it('refuses a link to a player who has never been sent email', async () => {
		expect(
			await codeOf(getEmailPreferences, { playerId: OTHER, token: 'anything' })
		).toBe('permission-denied')
	})

	it('asks a visitor with no link to sign in', async () => {
		expect(await codeOf(getEmailPreferences, {})).toBe('unauthenticated')
	})

	it('explains when a signed-in player has no email on file', async () => {
		await firestore.collection('playerContacts').doc(PLAYER).delete()
		expect(await codeOf(getEmailPreferences, {}, authed(PLAYER))).toBe(
			'not-found'
		)
	})

	it('never returns the full address or the token', async () => {
		const response = await call(getEmailPreferences, withLink())
		const text = JSON.stringify(response)
		expect(text).not.toContain('pat@example.com')
		expect(text).not.toContain(token)
	})
})

describe('updateEmailPreferences', () => {
	it('unsubscribes from one kind of email with the link, signed out', async () => {
		const response = await call(
			updateEmailPreferences,
			withLink({ preferences: { announcements: false } })
		)

		expect(response.preferences).toEqual({ ...ALL_ON, announcements: false })
		expect((await contactOf(firestore, PLAYER))?.emailPreferences).toEqual({
			announcements: false,
		})
	})

	it('unsubscribes from everything at once', async () => {
		const response = await call(
			updateEmailPreferences,
			withLink({
				preferences: {
					announcements: false,
					registration: false,
					teams: false,
				},
			})
		)

		expect(Object.values(response.preferences)).toEqual([false, false, false])
	})

	it('resubscribes', async () => {
		await call(
			updateEmailPreferences,
			withLink({ preferences: { teams: false } })
		)

		const response = await call(
			updateEmailPreferences,
			withLink({ preferences: { teams: true } })
		)

		expect(response.preferences.teams).toBe(true)
	})

	it('leaves unmentioned kinds as they were', async () => {
		await call(
			updateEmailPreferences,
			withLink({ preferences: { teams: false } })
		)

		const response = await call(
			updateEmailPreferences,
			withLink({ preferences: { registration: false } })
		)

		expect(response.preferences).toEqual({
			announcements: true,
			registration: false,
			teams: false,
		})
	})

	it('records when the preferences changed', async () => {
		await call(
			updateEmailPreferences,
			withLink({ preferences: { teams: false } })
		)
		expect(
			(await contactOf(firestore, PLAYER))?.emailPreferencesUpdatedAt
		).toBeDefined()
	})

	it('saves for the player signed in as themselves', async () => {
		await call(
			updateEmailPreferences,
			{ preferences: { registration: false } },
			authed(PLAYER)
		)
		expect((await contactOf(firestore, PLAYER))?.emailPreferences).toEqual({
			registration: false,
		})
	})

	it('cannot change another player’s, signed in or not', async () => {
		expect(
			await codeOf(updateEmailPreferences, {
				playerId: OTHER,
				token,
				preferences: { teams: false },
			})
		).toBe('permission-denied')
		expect(await contactOf(firestore, OTHER)).not.toHaveProperty(
			'emailPreferences'
		)
	})

	it.each([
		['no changes', {}],
		['a list instead of choices', []],
		['text instead of choices', 'unsubscribe'],
		['account email, which cannot be turned off', { account: false }],
		['a kind of email that does not exist', { newsletters: false }],
		['a value that is not on or off', { teams: 'no' }],
	])('refuses %s', async (_label, preferences) => {
		expect(
			await codeOf(updateEmailPreferences, withLink({ preferences }))
		).toBe('invalid-argument')
		expect(await contactOf(firestore, PLAYER)).not.toHaveProperty(
			'emailPreferences'
		)
	})

	it('refuses a wrong token and changes nothing', async () => {
		expect(
			await codeOf(
				updateEmailPreferences,
				withLink({ token: 'guessed', preferences: { teams: false } })
			)
		).toBe('permission-denied')
		expect(await contactOf(firestore, PLAYER)).not.toHaveProperty(
			'emailPreferences'
		)
	})
})

describe('the link in a real email', () => {
	it('opens the preferences page for that player, and unsubscribes them', async () => {
		// The whole path: an email is sent, the person clicks its footer link,
		// and the page's callables accept what that link carries.
		await setEmailMode(firestore, 'live')
		const id = (
			await queueEmail(firestore, {
				to: { playerId: PLAYER },
				template: 'seasonAnnouncement',
				props: {
					seasonName: '2026 Fall',
					registrationOpens: 'Thursday, October 1',
					registrationCloses: 'Saturday, October 31',
					firstGame: 'Saturday, November 7',
					teamFee: '$1,000',
					teamSpots: 12,
					minimumSignedPlayers: 10,
				},
			})
		).id
		const resend = fakeResend()
		await deliverQueuedEmail(firestore, id, resend)
		const footerLink = resend.sent[0].email.text.match(
			/https:\/\/mplswinterleague\.com\/email-preferences\?[^\s\]]+/
		)?.[0]
		expect(footerLink).toBeDefined()
		const { p, t, c } = linkParams(footerLink ?? '')
		expect(c).toBe('announcements')

		const response = await call(updateEmailPreferences, {
			playerId: p,
			token: t,
			preferences: { [c]: false },
		})

		expect(response.preferences.announcements).toBe(false)
	})
})
