import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { CallableRequest } from 'firebase-functions/v2/https'
import { getAuth } from 'firebase-admin/auth'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
	type Callable,
	initTestApp,
	resetFirestore,
	seedAuthUser,
} from './helpers.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
} from '../../Functions/src/shared/database.js'

/**
 * A player deleting their own account from their profile.
 *
 * It used to delete only the player document: the sign-in survived, able to
 * sign in to a half-deleted profile, and anyone who had ever been on a team
 * was refused outright. It now removes the data and the sign-in, with guards
 * for the cases where deleting would break something.
 */

const PLAYER = 'player-1'
const CURRENT = 'season-now'
const PAST = 'season-past'
const DAY_MS = 24 * 60 * 60 * 1000

let firestore: Firestore
let deletePlayer: Callable

const nowSeconds = (): number => Math.floor(Date.now() / 1000)

/** Signed in `secondsAgo` seconds ago, with or without a verified email. */
const caller = (uid: string, secondsAgo = 30, emailVerified = true) =>
	({
		uid,
		token: {
			email: `${uid}@example.com`,
			email_verified: emailVerified,
			auth_time: nowSeconds() - secondsAgo,
		},
	}) as unknown as CallableRequest<never>['auth']

const run = async (auth: CallableRequest<never>['auth']): Promise<unknown> =>
	await deletePlayer.run({
		auth,
		data: {},
	} as unknown as CallableRequest<never>)

const failure = async (
	auth: CallableRequest<never>['auth']
): Promise<{ code: string; message: string }> => {
	try {
		await run(auth)
	} catch (error) {
		return error as { code: string; message: string }
	}
	throw new Error('expected deletion to be refused')
}

const exists = async (path: string): Promise<boolean> =>
	(await firestore.doc(path).get()).exists

const authUserExists = async (uid: string): Promise<boolean> =>
	getAuth()
		.getUser(uid)
		.then(() => true)
		.catch(() => false)

const seedPlayer = async (uid: string, admin = false): Promise<void> => {
	await seedAuthUser(uid, true)
	await firestore.doc(`players/${uid}`).set({
		admin,
		firstname: 'Test',
		lastname: 'Player',
	})
	await firestore
		.doc(`playerContacts/${uid}`)
		.set({ email: `${uid}@example.com` })
	for (const seasonId of [CURRENT, PAST]) {
		await playerSeasonRef(firestore, uid, seasonId).set({
			season: firestore.doc(`seasons/${seasonId}`),
			team: null,
			paid: false,
			signed: false,
			captain: false,
		})
	}
}

/** Puts PLAYER on a team for a season, on both sides of the relationship. */
const rosterOn = async (seasonId: string): Promise<void> => {
	await teamRosterEntryRef(firestore, 'team-1', seasonId, PLAYER).set({
		player: firestore.doc(`players/${PLAYER}`),
		dateJoined: Timestamp.now(),
	})
	await playerSeasonRef(firestore, PLAYER, seasonId).update({
		team: firestore.doc('teams/team-1'),
	})
}

beforeAll(async () => {
	firestore = initTestApp()
	const manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
	deletePlayer = manifest.deletePlayer as Callable
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await firestore.doc(`seasons/${PAST}`).set({
		name: '2025 Fall',
		dateStart: Timestamp.fromMillis(Date.now() - 300 * DAY_MS),
	})
	await firestore.doc(`seasons/${CURRENT}`).set({
		name: '2026 Fall',
		dateStart: Timestamp.fromMillis(Date.now() + 30 * DAY_MS),
	})
	await seedPlayer(PLAYER)
})

describe('deletePlayer', () => {
	it('deletes the sign-in as well as the data', async () => {
		await expect(run(caller(PLAYER))).resolves.toMatchObject({
			success: true,
		})

		expect(await authUserExists(PLAYER)).toBe(false)
		expect(await exists(`players/${PLAYER}`)).toBe(false)
		expect(await exists(`players/${PLAYER}/playerSeasons/${CURRENT}`)).toBe(
			false
		)
	})

	it('allows a player whose team history is in past seasons', async () => {
		// This used to be refused for anyone who had ever been on a team.
		await rosterOn(PAST)

		await run(caller(PLAYER))

		expect(await authUserExists(PLAYER)).toBe(false)
		expect(
			await exists(`teams/team-1/teamSeasons/${PAST}/roster/${PLAYER}`)
		).toBe(false)
	})

	it('deletes the private email', async () => {
		await run(caller(PLAYER))

		expect(await exists(`playerContacts/${PLAYER}`)).toBe(false)
	})

	it('keeps signed waivers', async () => {
		await firestore
			.doc(`players/${PLAYER}/waiverSignatures/sig-1`)
			.set({ seasonId: PAST })

		await run(caller(PLAYER))

		expect(await exists(`players/${PLAYER}/waiverSignatures/sig-1`)).toBe(true)
	})

	it('removes the leaderboard entry', async () => {
		await firestore
			.doc(`rankings/${PLAYER}`)
			.set({ playerId: PLAYER, playerName: 'Test Player' })

		await run(caller(PLAYER))

		expect(await exists(`rankings/${PLAYER}`)).toBe(false)
	})

	it('refuses a player on a team this season', async () => {
		await rosterOn(CURRENT)

		const error = await failure(caller(PLAYER))

		expect(error.code).toBe('failed-precondition')
		expect(error.message).toBe(
			'Leave your team for 2026 Fall before deleting your account.'
		)
		expect(await authUserExists(PLAYER)).toBe(true)
		expect(await exists(`players/${PLAYER}`)).toBe(true)
	})

	it('refuses a sign-in older than five minutes', async () => {
		const error = await failure(caller(PLAYER, 6 * 60))

		expect(error.code).toBe('failed-precondition')
		expect(error.message).toMatch(/confirm your password again/)
		expect(await authUserExists(PLAYER)).toBe(true)
	})

	it('refuses a token with no sign-in time', async () => {
		const error = await failure({
			uid: PLAYER,
			token: { email_verified: true },
		} as unknown as CallableRequest<never>['auth'])

		expect(error.code).toBe('failed-precondition')
	})

	it('allows an unverified email', async () => {
		await run(caller(PLAYER, 30, false))

		expect(await authUserExists(PLAYER)).toBe(false)
	})

	it('refuses the league’s only admin', async () => {
		await firestore.doc(`players/${PLAYER}`).update({ admin: true })

		const error = await failure(caller(PLAYER))

		expect(error.message).toMatch(/only admin/)
		expect(await exists(`players/${PLAYER}`)).toBe(true)
	})

	it('refuses a banned player, who could otherwise sign up again unbanned', async () => {
		await firestore.doc(`players/${PLAYER}`).update({ banned: true })

		const error = await failure(caller(PLAYER))

		expect(error.code).toBe('failed-precondition')
		expect(error.message).toMatch(/banned/)
		expect(await exists(`players/${PLAYER}`)).toBe(true)
		expect(await authUserExists(PLAYER)).toBe(true)
	})

	it('allows an admin when another admin remains', async () => {
		await firestore.doc(`players/${PLAYER}`).update({ admin: true })
		await seedPlayer('admin-2', true)

		await run(caller(PLAYER))

		expect(await authUserExists(PLAYER)).toBe(false)
		expect(await exists('players/admin-2')).toBe(true)
	})

	it('deletes only the caller, whatever the request says', async () => {
		await seedPlayer('player-2')

		await deletePlayer.run({
			auth: caller(PLAYER),
			data: { playerId: 'player-2', adminOverride: true },
		} as unknown as CallableRequest<never>)

		expect(await authUserExists('player-2')).toBe(true)
		expect(await exists('players/player-2')).toBe(true)
		expect(await authUserExists(PLAYER)).toBe(false)
	})

	it('finishes a deletion whose data was already removed', async () => {
		// A retry after the data went but the sign-in did not.
		await firestore.doc(`players/${PLAYER}`).delete()

		await run(caller(PLAYER))

		expect(await authUserExists(PLAYER)).toBe(false)
	})
})
