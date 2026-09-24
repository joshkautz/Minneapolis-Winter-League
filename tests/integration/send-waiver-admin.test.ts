import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	type Callable,
} from './helpers.js'
import { playerSeasonRef } from '../../Functions/src/shared/database.js'

/**
 * sendWaiverAdmin: an admin sending a player their waiver by hand.
 *
 * It used to require the player to be marked paid, which stopped fitting
 * twice over: waivers now go out when a player joins a roster, and under
 * team payments nobody is individually paid at all. A player on a team is
 * eligible; so is one marked paid who has not found a team yet.
 */

const sendWithTemplate = vi.fn()

vi.mock('@dropbox/sign', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	SignatureRequestApi: class {
		username = ''
		signatureRequestSendWithTemplate = sendWithTemplate
	},
}))

const SEASON = 'season-1'
const ADMIN = 'admin-1'
const PLAYER = 'player-1'

let firestore: Firestore
let sendWaiverAdmin: Callable

const seasonRef = () => firestore.collection('seasons').doc(SEASON)

const seedPlayerSeason = async (fields: {
	team?: boolean
	paid?: boolean
	signed?: boolean
}) => {
	await playerSeasonRef(firestore, PLAYER, SEASON).set({
		season: seasonRef(),
		team: fields.team ? firestore.collection('teams').doc('team-1') : null,
		captain: false,
		paid: fields.paid ?? false,
		signed: fields.signed ?? false,
	})
}

const send = () =>
	errorCodeFrom(sendWaiverAdmin, {
		auth: authed(ADMIN),
		data: { playerId: PLAYER, seasonId: SEASON },
	})

beforeAll(async () => {
	firestore = initTestApp()
	process.env.DROPBOX_SIGN_API_KEY ??= 'test-key'
	const mod = await import('../../Functions/src/index.js')
	sendWaiverAdmin = mod.sendWaiverAdmin as unknown as Callable
})

beforeEach(async () => {
	await resetFirestore(firestore)
	sendWithTemplate.mockReset()
	sendWithTemplate.mockResolvedValue({
		body: { signatureRequest: { signatureRequestId: 'sig-1' } },
	})
	await seasonRef().set({
		name: '2030 Winter',
		dateStart: Timestamp.now(),
		registrationStart: Timestamp.fromMillis(Date.now() - 86_400_000),
	})
	await firestore
		.collection('players')
		.doc(ADMIN)
		.set({ admin: true, banned: false, email: 'admin@example.com' })
	await firestore.collection('players').doc(PLAYER).set({
		admin: false,
		banned: false,
		email: 'player@example.com',
		firstname: 'Test',
		lastname: 'Player',
	})
})

describe('sendWaiverAdmin eligibility', () => {
	it('sends to a player on a team who has not paid', async () => {
		// Every rostered player under team payments.
		await seedPlayerSeason({ team: true, paid: false })

		expect(await send()).toBeNull()
		expect(sendWithTemplate).toHaveBeenCalledTimes(1)
	})

	it('sends to a paid player who has not found a team', async () => {
		// Paid cash before joining one.
		await seedPlayerSeason({ team: false, paid: true })

		expect(await send()).toBeNull()
		expect(sendWithTemplate).toHaveBeenCalledTimes(1)
	})

	it('refuses a player who is neither on a team nor paid', async () => {
		await seedPlayerSeason({ team: false, paid: false })

		expect(await send()).toBe('failed-precondition')
		expect(sendWithTemplate).not.toHaveBeenCalled()
	})

	it('refuses a player with no record for the season', async () => {
		expect(await send()).toBe('failed-precondition')
		expect(sendWithTemplate).not.toHaveBeenCalled()
	})

	it('refuses to send a second waiver for the same season', async () => {
		await seedPlayerSeason({ team: true })
		expect(await send()).toBeNull()

		expect(await send()).toBe('already-exists')
		expect(sendWithTemplate).toHaveBeenCalledTimes(1)
	})
})
