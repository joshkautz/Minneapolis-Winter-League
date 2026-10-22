import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
	authed,
	DAY_MS,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
} from './helpers.js'
import {
	createPlayer,
	updatePlayer,
	updatePlayerAdmin,
} from '../../Functions/src/index.js'
import { deletePlayerAccountData } from '../../Functions/src/services/accountDeletion.js'

/**
 * A player's real name, their nickname, and the history of both.
 *
 * Players renamed themselves for fun after signing their waivers, so the
 * roster stopped saying who was playing. Now the real name locks once the
 * current season's waiver is signed (an admin can still change it), the
 * nickname is the place for fun, and every change by any route is kept in
 * an admin-only history written with the change itself.
 */

const PLAYER = 'player-1'
const ADMIN = 'admin-1'
const SEASON = 'season-5'
const OLD_SEASON = 'season-4'

let firestore: Firestore

const playerRef = (id = PLAYER) => firestore.collection('players').doc(id)
const readPlayer = async () => (await playerRef().get()).data()
const history = async (id = PLAYER) =>
	(
		await playerRef(id).collection('nameHistory').orderBy('changedAt').get()
	).docs.map((doc) => doc.data())

const run = (
	fn: { run: (request: CallableRequest<never>) => unknown },
	uid: string,
	data: Record<string, unknown>
) => fn.run({ auth: authed(uid), data } as unknown as CallableRequest<never>)

const asPlayer = (data: Record<string, unknown>) =>
	run(updatePlayer, PLAYER, data)
const asPlayerFails = (data: Record<string, unknown>) =>
	errorCodeFrom(updatePlayer, { auth: authed(PLAYER), data })
const asAdmin = (data: Record<string, unknown>) =>
	run(updatePlayerAdmin, ADMIN, { playerId: PLAYER, ...data })

const signSeason = (seasonId: string, signed: boolean) =>
	playerRef()
		.collection('playerSeasons')
		.doc(seasonId)
		.set({
			season: firestore.collection('seasons').doc(seasonId),
			team: null,
			paid: false,
			signed,
			captain: false,
		})

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	// Season 5 is the current one: the latest to start.
	await firestore
		.collection('seasons')
		.doc(SEASON)
		.set({
			name: 'Season 5',
			dateStart: Timestamp.fromMillis(Date.now() + 20 * DAY_MS),
			dateEnd: Timestamp.fromMillis(Date.now() + 60 * DAY_MS),
			registrationEnd: Timestamp.fromMillis(Date.now() + 10 * DAY_MS),
		})
	await firestore
		.collection('seasons')
		.doc(OLD_SEASON)
		.set({
			name: 'Season 4',
			dateStart: Timestamp.fromMillis(Date.now() - 300 * DAY_MS),
			dateEnd: Timestamp.fromMillis(Date.now() - 250 * DAY_MS),
			registrationEnd: Timestamp.fromMillis(Date.now() - 310 * DAY_MS),
		})
	await playerRef(ADMIN).set({
		admin: true,
		firstname: 'Ada',
		lastname: 'Min',
	})
	await playerRef().set({ admin: false, firstname: 'John', lastname: 'Lei' })
})

describe('the real name locks once the current waiver is signed', () => {
	beforeEach(async () => {
		await signSeason(SEASON, true)
	})

	it('refuses a signed player changing their first or last name', async () => {
		expect(await asPlayerFails({ firstname: 'Zheng' })).toBe(
			'failed-precondition'
		)
		expect(await asPlayerFails({ lastname: 'Of Addie' })).toBe(
			'failed-precondition'
		)
		expect(await readPlayer()).toMatchObject({
			firstname: 'John',
			lastname: 'Lei',
		})
		expect(await history()).toEqual([])
	})

	it('says why, and who can change it', async () => {
		await expect(asPlayer({ firstname: 'Zheng' })).rejects.toThrow(
			'Your name is on your signed waiver for Season 5. To change it, contact the league.'
		)
	})

	it('still saves the same name, so the profile form can resubmit it', async () => {
		await asPlayer({ firstname: 'John', lastname: 'Lei', nickname: 'Addie' })

		expect(await readPlayer()).toMatchObject({
			firstname: 'John',
			lastname: 'Lei',
			nickname: 'Addie',
		})
	})

	it('treats a name saved before normalizing as unchanged', async () => {
		// Stored lowercase before names were normalized; the form submits
		// what it shows, which normalizes to "John".
		await playerRef().update({ firstname: 'john' })

		await asPlayer({ firstname: 'john', lastname: 'Lei', nickname: 'Addie' })

		expect(await readPlayer()).toMatchObject({
			firstname: 'john',
			nickname: 'Addie',
		})
	})

	it('lets an admin change it, through either callable', async () => {
		await asAdmin({ firstname: 'Johnny' })
		expect((await readPlayer())?.firstname).toBe('Johnny')

		await run(updatePlayer, ADMIN, { playerId: PLAYER, lastname: 'Leigh' })
		expect((await readPlayer())?.lastname).toBe('Leigh')
	})
})

describe('before the current waiver is signed', () => {
	it('lets the player correct their name', async () => {
		await signSeason(SEASON, false)

		await asPlayer({ firstname: 'Jon' })

		expect((await readPlayer())?.firstname).toBe('Jon')
	})

	it('does not count a waiver from an earlier season', async () => {
		await signSeason(OLD_SEASON, true)

		await asPlayer({ lastname: 'Lee' })

		expect((await readPlayer())?.lastname).toBe('Lee')
	})
})

describe('the nickname', () => {
	beforeEach(async () => {
		await signSeason(SEASON, true)
	})

	it('can be set and cleared by the player at any time', async () => {
		await asPlayer({ nickname: 'Zheng of Addie' })
		expect((await readPlayer())?.nickname).toBe('Zheng of Addie')

		await asPlayer({ nickname: '' })
		expect((await readPlayer())?.nickname).toBeNull()
	})

	it('follows the name rules', async () => {
		expect(await asPlayerFails({ nickname: 'Addie 2' })).toBe(
			'invalid-argument'
		)
		expect(await asPlayerFails({ nickname: 'Shit' })).toBe('invalid-argument')
		expect((await readPlayer())?.nickname).toBeUndefined()
	})

	it('can be set or cleared by an admin, past the language filter', async () => {
		await asAdmin({ nickname: 'Shit' })
		expect((await readPlayer())?.nickname).toBe('Shit')

		const result = (await asAdmin({ nickname: null })) as {
			changes: { nickname?: { from: string | null; to: string | null } }
		}
		expect(result.changes.nickname).toEqual({ from: 'Shit', to: null })
		expect((await readPlayer())?.nickname).toBeNull()
	})
})

describe('the name history', () => {
	it('starts with the name given at sign-up', async () => {
		await run(createPlayer, 'new-player', {
			firstname: 'venice',
			lastname: 'fan',
			email: 'new-player@example.com',
		})

		expect(await history('new-player')).toMatchObject([
			{
				before: null,
				after: { firstname: 'Venice', lastname: 'Fan', nickname: null },
				changedBy: 'new-player',
				source: 'signup',
			},
		])
	})

	it('records each change, whoever makes it', async () => {
		await asPlayer({ firstname: 'Zheng', lastname: 'Of Addie' })
		await asPlayer({ nickname: 'Addie' })
		await asAdmin({ firstname: 'John', lastname: 'Lei' })

		const entries = await history()
		expect(entries).toMatchObject([
			{
				before: { firstname: 'John', lastname: 'Lei', nickname: null },
				after: { firstname: 'Zheng', lastname: 'Of Addie', nickname: null },
				changedBy: PLAYER,
				source: 'player',
			},
			{
				before: { firstname: 'Zheng', lastname: 'Of Addie', nickname: null },
				after: { firstname: 'Zheng', lastname: 'Of Addie', nickname: 'Addie' },
				changedBy: PLAYER,
				source: 'player',
			},
			{
				before: { firstname: 'Zheng', lastname: 'Of Addie', nickname: 'Addie' },
				after: { firstname: 'John', lastname: 'Lei', nickname: 'Addie' },
				changedBy: ADMIN,
				source: 'admin',
			},
		])
		for (const entry of entries) {
			expect(entry.changedAt).toBeInstanceOf(Timestamp)
		}
	})

	it('records an admin editing through updatePlayer as an admin', async () => {
		await run(updatePlayer, ADMIN, { playerId: PLAYER, firstname: 'Jon' })

		expect(await history()).toMatchObject([
			{ changedBy: ADMIN, source: 'admin' },
		])
	})

	it('records nothing when a save changes nothing', async () => {
		await asPlayer({ firstname: 'John', lastname: 'Lei' })
		await asAdmin({ firstname: 'John', banned: false })

		expect(await history()).toEqual([])
	})

	it('records nothing for a refused change', async () => {
		await signSeason(SEASON, true)
		await asPlayerFails({ firstname: 'Zheng', nickname: 'Addie' })

		expect(await history()).toEqual([])
		expect((await readPlayer())?.nickname).toBeUndefined()
	})

	it('goes with the account when it is deleted', async () => {
		await asPlayer({ nickname: 'Addie' })
		expect(await history()).toHaveLength(1)

		// What deletePlayer and the userDeleted trigger both run.
		await deletePlayerAccountData(firestore, PLAYER)

		expect(await history()).toEqual([])
	})
})
