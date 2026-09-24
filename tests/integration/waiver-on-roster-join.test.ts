import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'

/**
 * A waiver is what makes a player registered, and it now arrives when they
 * join a roster rather than when they pay.
 *
 * Tying it to payment worked only while every player paid for themselves.
 * Under team-level payment one person can pay for the whole team, so everyone
 * else would go without — and since a team needs ten *signed* players to
 * register, that team could never register at all.
 *
 * The failure mode here is a waiver that never arrives, which nothing
 * surfaces to anyone, so these cover the trigger firing at all as much as
 * what it sends.
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
const TEAM = 'team-1'
const PLAYER = 'player-1'

let firestore: Firestore
let onRosterEntryCreated: { run: (event: unknown) => Promise<unknown> }

const seasonRef = () => firestore.collection('seasons').doc(SEASON)
const playerRef = (playerId: string) =>
	firestore.collection('players').doc(playerId)

const joinEvent = (playerId = PLAYER, teamId = TEAM) => ({
	params: { teamId, seasonId: SEASON, playerId },
	data: { exists: true, data: () => ({ player: playerRef(playerId) }) },
})

const readWaivers = async (playerId = PLAYER) =>
	(
		await firestore
			.collection('dropbox')
			.doc(playerId)
			.collection('waivers')
			.get()
	).docs.map((d) => d.data())

const seedPlayer = async (playerId: string) => {
	await playerRef(playerId).set({
		admin: false,
		banned: false,
		email: `${playerId}@example.com`,
		firstname: 'Test',
		lastname: 'Player',
	})
}

const okResponse = (id = 'sig-1') => ({
	body: { signatureRequest: { signatureRequestId: id } },
})

beforeAll(async () => {
	firestore = initTestApp()
	process.env.DROPBOX_SIGN_API_KEY ??= 'test-key'
	const mod = await import('../../Functions/src/index.js')
	onRosterEntryCreated = mod.onRosterEntryCreated as never
})

beforeEach(async () => {
	await resetFirestore(firestore)
	sendWithTemplate.mockReset()
	sendWithTemplate.mockResolvedValue(okResponse())
	await seasonRef().set({ name: '2030 Winter', dateStart: Timestamp.now() })
	await firestore
		.collection('teams')
		.doc(TEAM)
		.set({ createdAt: Timestamp.now(), createdBy: null })
	await teamSeasonRef(firestore, TEAM, SEASON).set({
		season: seasonRef(),
		name: 'Test Team',
		registered: false,
		registeredDate: null,
	})
	await seedPlayer(PLAYER)
})

describe('onRosterEntryCreated', () => {
	it('sends a waiver when a player joins a roster', async () => {
		await onRosterEntryCreated.run(joinEvent())

		expect(sendWithTemplate).toHaveBeenCalledTimes(1)
		expect(await readWaivers()).toMatchObject([
			{ seasonId: SEASON, signatureRequestId: 'sig-1', status: 'pending' },
		])
	})

	it('sends to a player who has paid nothing', async () => {
		// The case the whole change exists for: a teammate whose captain paid
		// for the team still needs a waiver, and has no payment to trigger it.
		await playerSeasonRef(firestore, PLAYER, SEASON).set({
			season: seasonRef(),
			team: firestore.collection('teams').doc(TEAM),
			paid: false,
			signed: false,
			captain: false,
		})

		await onRosterEntryCreated.run(joinEvent())

		expect(sendWithTemplate).toHaveBeenCalledTimes(1)
	})

	it('sends for a player with no season subdoc at all', async () => {
		// Joining a roster is the trigger, not season state.
		await onRosterEntryCreated.run(joinEvent())

		expect(await readWaivers()).toHaveLength(1)
	})

	it('carries the metadata the webhook matches on', async () => {
		// dropboxSignWebhook finds the player from exactly these two fields;
		// a wrong value orphans a signed waiver.
		await onRosterEntryCreated.run(joinEvent())

		expect(sendWithTemplate.mock.calls[0][0].metadata).toEqual({
			firebaseUID: PLAYER,
			seasonId: SEASON,
		})
	})

	it('addresses the request to the player', async () => {
		await onRosterEntryCreated.run(joinEvent())

		expect(sendWithTemplate.mock.calls[0][0].signers[0]).toMatchObject({
			name: 'Test Player',
			emailAddress: `${PLAYER}@example.com`,
		})
	})

	it('does not send a second waiver for the same season', async () => {
		// The trigger can fire again for a membership that already exists — a
		// team merge rewrites roster entries for players who never left.
		await onRosterEntryCreated.run(joinEvent())
		await onRosterEntryCreated.run(joinEvent())

		expect(sendWithTemplate).toHaveBeenCalledTimes(1)
		expect(await readWaivers()).toHaveLength(1)
	})

	it('does not re-send when the player changes teams mid-season', async () => {
		await onRosterEntryCreated.run(joinEvent())
		sendWithTemplate.mockClear()

		await onRosterEntryCreated.run(joinEvent(PLAYER, 'team-2'))

		expect(sendWithTemplate).not.toHaveBeenCalled()
	})

	it('sends a separate waiver for a different season', async () => {
		await firestore
			.collection('seasons')
			.doc('season-2')
			.set({ name: '2031 Winter', dateStart: Timestamp.now() })
		await onRosterEntryCreated.run(joinEvent())

		await onRosterEntryCreated.run({
			params: { teamId: TEAM, seasonId: 'season-2', playerId: PLAYER },
			data: { exists: true, data: () => ({ player: playerRef(PLAYER) }) },
		})

		expect(sendWithTemplate).toHaveBeenCalledTimes(2)
		expect(await readWaivers()).toHaveLength(2)
	})

	it('does not send for a roster entry whose player is gone', async () => {
		await playerRef(PLAYER).delete()

		await onRosterEntryCreated.run(joinEvent())

		expect(sendWithTemplate).not.toHaveBeenCalled()
		expect(await readWaivers()).toHaveLength(0)
	})

	it('records no waiver when Dropbox Sign returns no id', async () => {
		// Better a player with no waiver than a waiver document that can never
		// be matched to a signature.
		sendWithTemplate.mockResolvedValue({ body: {} })

		await onRosterEntryCreated.run(joinEvent())

		expect(await readWaivers()).toHaveLength(0)
	})

	it('rethrows so a transient failure is retried', async () => {
		// Nothing surfaces a missing waiver, so the trigger must not swallow
		// the error. requestWaiver is idempotent, so a retry cannot
		// double-send.
		sendWithTemplate.mockRejectedValue(new Error('HTTP request failed'))

		await expect(onRosterEntryCreated.run(joinEvent())).rejects.toThrow()
	})

	it('does not call Dropbox Sign under the emulator unless opted in', async () => {
		// Seeding the emulator creates hundreds of roster entries, each of
		// which fired this trigger and emailed a real waiver request to the
		// seed player's real address (24 September 2026).
		vi.stubEnv('FUNCTIONS_EMULATOR', 'true')
		try {
			await onRosterEntryCreated.run(joinEvent())

			expect(sendWithTemplate).not.toHaveBeenCalled()
			expect(await readWaivers()).toHaveLength(0)

			vi.stubEnv('MWL_EMULATOR_USE_DROPBOX_SIGN', 'true')
			await onRosterEntryCreated.run(joinEvent())

			expect(sendWithTemplate).toHaveBeenCalledTimes(1)
		} finally {
			vi.unstubAllEnvs()
		}
	})

	it('does not run while a migration is in progress', async () => {
		await firestore
			.collection('system')
			.doc('maintenance')
			.set({ migrationInProgress: true })

		await onRosterEntryCreated.run(joinEvent())

		expect(sendWithTemplate).not.toHaveBeenCalled()
	})
})

describe('a whole team whose captain paid for everyone', () => {
	it('gets a waiver for every player, not just the payer', async () => {
		// End to end on the scenario that motivated team-level payment. Ten
		// players join; one of them will pay. All ten need waivers.
		const players = Array.from({ length: 10 }, (_, i) => `roster-${i}`)
		for (const playerId of players) {
			await seedPlayer(playerId)
			await teamRosterEntryRef(firestore, TEAM, SEASON, playerId).set({
				player: playerRef(playerId),
				dateJoined: Timestamp.now(),
			})
			await onRosterEntryCreated.run(joinEvent(playerId))
		}

		expect(sendWithTemplate).toHaveBeenCalledTimes(10)
		for (const playerId of players) {
			expect(await readWaivers(playerId)).toHaveLength(1)
		}
	})
})
