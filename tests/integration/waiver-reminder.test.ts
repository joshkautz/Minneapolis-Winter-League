import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CallableRequest } from 'firebase-functions/v2/https'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { authed, initTestApp, resetFirestore } from './helpers.js'
import { playerSeasonRef } from '../../Functions/src/shared/database.js'

/**
 * The profile's "Resend Waiver Email" button.
 *
 * A waiver is issued by `onRosterEntryCreated` when a player joins a roster,
 * and that trigger retries for a day and then gives up. When Dropbox Sign
 * refused every request — the API plan had lapsed, September 2026 — the first
 * player on a 2026 Fall roster was left with no waiver and a button that
 * answered "Please complete payment first", which under team payments is not
 * even a thing they can do. The button now issues the missing waiver.
 */

const sendWithTemplate = vi.fn()
const remind = vi.fn()

vi.mock('@dropbox/sign', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	SignatureRequestApi: class {
		username = ''
		signatureRequestSendWithTemplate = sendWithTemplate
		signatureRequestRemind = remind
	},
}))

const SEASON = 'season-1'
const TEAM = 'team-1'
const PLAYER = 'player-1'
const DAY_MS = 24 * 60 * 60 * 1000

let firestore: Firestore
let sendWaiverReminder: { run: (request: unknown) => Promise<unknown> }

const call = (): Promise<unknown> =>
	sendWaiverReminder.run({
		auth: authed(PLAYER),
		data: {},
	} as unknown as CallableRequest<never>)

/** The HttpsError a call rejects with. */
const failure = async (): Promise<{ code: string; message: string }> => {
	try {
		await call()
	} catch (error) {
		return error as { code: string; message: string }
	}
	throw new Error('expected the call to fail')
}

const readWaivers = async () =>
	(
		await firestore
			.collection('dropbox')
			.doc(PLAYER)
			.collection('waivers')
			.get()
	).docs.map((d) => d.data())

const putOnTeam = () =>
	playerSeasonRef(firestore, PLAYER, SEASON).set({
		season: firestore.collection('seasons').doc(SEASON),
		team: firestore.collection('teams').doc(TEAM),
		captain: true,
		paid: false,
		signed: false,
	})

const seedWaiver = (status: 'pending' | 'signed') =>
	firestore.collection('dropbox').doc(PLAYER).collection('waivers').add({
		seasonId: SEASON,
		signatureRequestId: 'sig-existing',
		status,
		createdAt: Timestamp.now(),
	})

beforeAll(async () => {
	firestore = initTestApp()
	process.env.DROPBOX_SIGN_API_KEY ??= 'test-key'
	const mod = await import('../../Functions/src/index.js')
	sendWaiverReminder = mod.sendWaiverReminder as never
})

beforeEach(async () => {
	await resetFirestore(firestore)
	sendWithTemplate.mockReset()
	sendWithTemplate.mockResolvedValue({
		body: { signatureRequest: { signatureRequestId: 'sig-new' } },
	})
	remind.mockReset()
	remind.mockResolvedValue({ body: {} })

	const now = Date.now()
	await firestore
		.collection('seasons')
		.doc(SEASON)
		.set({
			name: '2030 Fall',
			dateStart: Timestamp.fromMillis(now + 30 * DAY_MS),
			registrationStart: Timestamp.fromMillis(now - DAY_MS),
			registrationEnd: Timestamp.fromMillis(now + DAY_MS),
		})
	await firestore
		.collection('players')
		.doc(PLAYER)
		.set({
			admin: false,
			banned: false,
			email: `${PLAYER}@example.com`,
			firstname: 'Test',
			lastname: 'Player',
		})
})

describe('sendWaiverReminder', () => {
	it('issues a waiver to a rostered player who has none', async () => {
		await putOnTeam()

		await expect(call()).resolves.toMatchObject({
			success: true,
			message: 'Waiver email sent',
			signatureRequestId: 'sig-new',
		})

		expect(sendWithTemplate).toHaveBeenCalledTimes(1)
		expect(remind).not.toHaveBeenCalled()
		expect(await readWaivers()).toMatchObject([
			{ seasonId: SEASON, signatureRequestId: 'sig-new', status: 'pending' },
		])
	})

	it('tells a player on no team that the waiver comes when they join one', async () => {
		const error = await failure()

		expect(error.code).toBe('failed-precondition')
		expect(error.message).toBe(
			'Your waiver is emailed when you join a team for this season.'
		)
		expect(sendWithTemplate).not.toHaveBeenCalled()
	})

	it('reminds rather than re-issues when a waiver is pending', async () => {
		await putOnTeam()
		await seedWaiver('pending')

		await expect(call()).resolves.toMatchObject({
			success: true,
			signatureRequestId: 'sig-existing',
		})

		expect(remind).toHaveBeenCalledWith('sig-existing', {
			emailAddress: `${PLAYER}@example.com`,
		})
		expect(sendWithTemplate).not.toHaveBeenCalled()
		expect(await readWaivers()).toHaveLength(1)
	})

	it('refuses to resend a signed waiver', async () => {
		await putOnTeam()
		await seedWaiver('signed')

		const error = await failure()

		expect(error.code).toBe('failed-precondition')
		expect(error.message).toBe('Waiver has already been signed')
		expect(remind).not.toHaveBeenCalled()
	})

	it('says to try later, and records nothing, when Dropbox Sign refuses', async () => {
		await putOnTeam()
		sendWithTemplate.mockRejectedValue(
			Object.assign(new Error('HTTP request failed'), {
				statusCode: 403,
				body: { error: { errorName: 'forbidden', errorMsg: 'No API quota' } },
			})
		)

		const error = await failure()

		expect(error.code).toBe('unavailable')
		expect(error.message).toBe(
			'We could not send your waiver right now. Please try again later.'
		)
		expect(await readWaivers()).toHaveLength(0)
	})

	it('says to try later when a reminder is refused', async () => {
		await putOnTeam()
		await seedWaiver('pending')
		remind.mockRejectedValue(new Error('HTTP request failed'))

		const error = await failure()

		expect(error.code).toBe('unavailable')
	})
})
