import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getAuth } from 'firebase-admin/auth'
import type { Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	seedAuthUser,
	unverified,
} from './helpers.js'
import { fakeResend, setEmailMode } from './email-helpers.js'
import {
	createPlayer,
	requestPasswordReset,
	sendVerificationEmail,
} from '../../Functions/src/index.js'
import { deliverQueuedEmail } from '../../Functions/src/email/sender.js'
import {
	ACCOUNT_EMAIL_COOLDOWN_MS,
	queueAccountEmail,
} from '../../Functions/src/email/accountEmails.js'
import { deletePlayerAccountData } from '../../Functions/src/services/accountDeletion.js'

/**
 * Email verification and password reset, sent by the league through the
 * outbox instead of by Firebase, against the Auth emulator.
 *
 * What matters: each email goes only to the account's own address, carries
 * a link on the league's site whose code Firebase accepts, cannot be sent
 * over and over, and the reset form says the same whether or not an account
 * exists. Nothing here sends email: no sender trigger runs.
 */

const PLAYER = 'player-1'
const SITE = 'https://mplswinterleague.com/auth/action?'
const AUTH_EMULATOR = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`

let firestore: Firestore

interface QueuedAccountMail {
	id: string
	toAddress: string | null
	toPlayerId: string | null
	category: string
	status: string
	props: { link?: string }
}

const accountMail = async (template: string): Promise<QueuedAccountMail[]> =>
	(
		await firestore.collection('mail').where('template', '==', template).get()
	).docs.map((doc) => ({ id: doc.id, ...doc.data() }) as QueuedAccountMail)

const codeOf = (link: string): string =>
	new URL(link).searchParams.get('oobCode') ?? ''

/** What the App's /auth/action page does with a code, via Auth's REST API. */
const identityToolkit = async (method: string, body: object) => {
	const response = await fetch(
		`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/${method}?key=fake-api-key`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}
	)
	return { ok: response.ok, body: await response.json() }
}

const resetFor = (email: unknown) =>
	requestPasswordReset.run({
		data: { email },
	} as unknown as CallableRequest<never>)

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seedAuthUser(PLAYER, false)
})

describe('sendVerificationEmail', () => {
	const send = () =>
		sendVerificationEmail.run({
			auth: unverified(PLAYER),
			data: {},
		} as unknown as CallableRequest<never>) as Promise<{
			sent: boolean
			alreadyVerified: boolean
			lastSentAt: string | null
			nextAllowedAt: string | null
		}>

	it('queues a confirmation on the league’s own page, to the account', async () => {
		await expect(send()).resolves.toMatchObject({
			alreadyVerified: false,
			sent: true,
		})

		const [mail] = await accountMail('emailVerification')
		expect(mail).toMatchObject({
			toAddress: `${PLAYER}@example.com`,
			toPlayerId: null,
			category: 'account',
		})
		const link = mail.props.link ?? ''
		expect(link.startsWith(`${SITE}mode=verifyEmail&oobCode=`)).toBe(true)
	})

	it('addresses the player by their player document once there is one', async () => {
		await firestore
			.collection('players')
			.doc(PLAYER)
			.set({ firstname: 'Pat', lastname: 'Player', admin: false })

		await send()

		expect((await accountMail('emailVerification'))[0]).toMatchObject({
			toPlayerId: PLAYER,
			toAddress: null,
		})
	})

	it('sends one at a time, and says when the last went and the next can', async () => {
		const first = await send()
		const second = await send()

		expect(second).toEqual({
			alreadyVerified: false,
			sent: false,
			lastSentAt: first.lastSentAt,
			nextAllowedAt: first.nextAllowedAt,
		})
		expect(
			Date.parse(second.nextAllowedAt ?? '') -
				Date.parse(second.lastSentAt ?? '')
		).toBe(ACCOUNT_EMAIL_COOLDOWN_MS)
		expect(await accountMail('emailVerification')).toHaveLength(1)
	})

	it('sends nothing for an address already confirmed', async () => {
		await seedAuthUser(PLAYER, true)

		await expect(send()).resolves.toEqual({
			alreadyVerified: true,
			sent: false,
			lastSentAt: null,
			nextAllowedAt: null,
		})
		expect(await accountMail('emailVerification')).toHaveLength(0)
	})

	it('carries a code Firebase accepts, confirming the address', async () => {
		await send()
		const link = (await accountMail('emailVerification'))[0].props.link ?? ''

		const result = await identityToolkit('accounts:update', {
			oobCode: codeOf(link),
		})

		expect(result.ok).toBe(true)
		expect((await getAuth().getUser(PLAYER)).emailVerified).toBe(true)
	})
})

describe('requestPasswordReset', () => {
	it('queues a reset link to the account’s own address', async () => {
		await expect(resetFor(`${PLAYER}@example.com`)).resolves.toEqual({
			success: true,
		})

		const [mail] = await accountMail('passwordReset')
		expect(mail).toMatchObject({
			toAddress: `${PLAYER}@example.com`,
			category: 'account',
		})
		expect(
			(mail.props.link ?? '').startsWith(`${SITE}mode=resetPassword&oobCode=`)
		).toBe(true)
	})

	it('finds the account however the address is typed', async () => {
		await resetFor(`  ${PLAYER.toUpperCase()}@EXAMPLE.com `)

		expect(await accountMail('passwordReset')).toHaveLength(1)
	})

	it('answers the same for an address no account uses, and sends nothing', async () => {
		await expect(resetFor('nobody@example.com')).resolves.toEqual({
			success: true,
		})
		expect(await accountMail('passwordReset')).toHaveLength(0)
	})

	it('sends one at a time, so it cannot flood an inbox', async () => {
		await resetFor(`${PLAYER}@example.com`)
		await resetFor(`${PLAYER}@example.com`)
		await resetFor(`${PLAYER}@example.com`)

		expect(await accountMail('passwordReset')).toHaveLength(1)
	})

	it('sends nothing for a disabled account', async () => {
		await getAuth().updateUser(PLAYER, { disabled: true })

		await expect(resetFor(`${PLAYER}@example.com`)).resolves.toEqual({
			success: true,
		})
		expect(await accountMail('passwordReset')).toHaveLength(0)
	})

	it('refuses something that is not an email address', async () => {
		for (const email of ['', 'not-an-email', 42, undefined]) {
			expect(
				await errorCodeFrom(requestPasswordReset, { data: { email } })
			).toBe('invalid-argument')
		}
	})

	it('carries a code Firebase accepts, changing the password', async () => {
		await resetFor(`${PLAYER}@example.com`)
		const link = (await accountMail('passwordReset'))[0].props.link ?? ''

		const result = await identityToolkit('accounts:resetPassword', {
			oobCode: codeOf(link),
			newPassword: 'a-new-password-1',
		})

		expect(result.ok).toBe(true)
		expect(result.body.email).toBe(`${PLAYER}@example.com`)
	})
})

describe('the cooldown', () => {
	const user = { uid: PLAYER, email: `${PLAYER}@example.com` }
	const at = (iso: string) => new Date(iso)

	it('counts from the last email, not from a window on the clock', async () => {
		// October 2026: three in five minutes, the first at sign-up and two
		// presses of the profile's button either side of a two-minute mark.
		await queueAccountEmail(
			firestore,
			'emailVerification',
			user,
			at('2026-10-28T13:59:10Z')
		)
		const second = await queueAccountEmail(
			firestore,
			'emailVerification',
			user,
			at('2026-10-28T14:01:56Z')
		)
		const third = await queueAccountEmail(
			firestore,
			'emailVerification',
			user,
			at('2026-10-28T14:03:28Z')
		)

		expect([second.sent, third.sent]).toEqual([false, false])
		expect(third.nextAllowedAt).toEqual(at('2026-10-28T14:09:10Z'))
		expect(await accountMail('emailVerification')).toHaveLength(1)
	})

	it('sends another once ten minutes have passed', async () => {
		await queueAccountEmail(
			firestore,
			'emailVerification',
			user,
			at('2026-10-28T13:59:10Z')
		)
		const later = await queueAccountEmail(
			firestore,
			'emailVerification',
			user,
			at('2026-10-28T14:09:10Z')
		)

		expect(later.sent).toBe(true)
		expect(await accountMail('emailVerification')).toHaveLength(2)
	})

	it('sends one email when two requests arrive together', async () => {
		const now = at('2026-10-28T14:00:00Z')
		const outcomes = await Promise.all([
			queueAccountEmail(firestore, 'passwordReset', user, now),
			queueAccountEmail(firestore, 'passwordReset', user, now),
		])

		expect(outcomes.filter((outcome) => outcome.sent)).toHaveLength(1)
		expect(await accountMail('passwordReset')).toHaveLength(1)
	})

	it('keeps each kind of email to its own cooldown', async () => {
		const now = at('2026-10-28T14:00:00Z')
		await queueAccountEmail(firestore, 'emailVerification', user, now)

		await expect(
			queueAccountEmail(firestore, 'passwordReset', user, now)
		).resolves.toMatchObject({ sent: true })
	})

	it('forgets the account’s sends when it is deleted', async () => {
		await queueAccountEmail(firestore, 'passwordReset', user)

		await deletePlayerAccountData(firestore, PLAYER)

		expect(
			(await firestore.collection('accountEmails').doc(PLAYER).get()).exists
		).toBe(false)
	})
})

describe('createPlayer', () => {
	const create = (auth: CallableRequest<never>['auth']) =>
		createPlayer.run({
			auth,
			data: {
				firstname: 'Pat',
				lastname: 'Player',
				email: `${PLAYER}@example.com`,
			},
		} as unknown as CallableRequest<never>)

	it('sends the new player their confirmation email', async () => {
		await create(unverified(PLAYER))

		expect(await accountMail('emailVerification')).toMatchObject([
			{ toPlayerId: PLAYER },
		])
	})

	it('sends none to an account already confirmed', async () => {
		await seedAuthUser(PLAYER, true)

		await create(authed(PLAYER))

		expect(await accountMail('emailVerification')).toHaveLength(0)
	})
})

describe('sending an account email', () => {
	it('sends the link, then removes it from the outbox', async () => {
		await setEmailMode(firestore, 'live')
		await resetFor(`${PLAYER}@example.com`)
		const [queued] = await accountMail('passwordReset')
		const link = queued.props.link ?? ''
		const resend = fakeResend()

		await deliverQueuedEmail(firestore, queued.id, resend)

		expect(resend.sent).toHaveLength(1)
		expect(resend.sent[0].email.html).toContain(link.replace(/&/g, '&amp;'))
		const [sent] = await accountMail('passwordReset')
		expect(sent.status).toBe('sent')
		expect(sent.props).toEqual({})
	})

	it('removes the link from an email that will not be sent, too', async () => {
		await setEmailMode(firestore, 'off')
		await resetFor(`${PLAYER}@example.com`)
		const [queued] = await accountMail('passwordReset')

		await deliverQueuedEmail(firestore, queued.id, fakeResend())

		expect((await accountMail('passwordReset'))[0].props).toEqual({})
	})
})
