import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { CallableRequest } from 'firebase-functions/v2/https'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
	authed,
	type Callable,
	initTestApp,
	resetFirestore,
	seedAuthUser,
} from './helpers.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'

/**
 * An admin deleting an unregistered team from Team Management.
 *
 * The page lists any season, but the callable took only the team and always
 * deleted its current-season entry — so Delete pressed while viewing a past
 * season removed the team from this season. It now takes the season and
 * refuses any but the current one.
 */

const ADMIN = 'admin-1'
const PLAYER = 'player-1'
const TEAM = 'team-1'
const CURRENT = 'season-now'
const PAST = 'season-past'
const DAY_MS = 24 * 60 * 60 * 1000

let firestore: Firestore
let deleteUnregisteredTeam: Callable

const run = async (data: Record<string, unknown>): Promise<unknown> =>
	await deleteUnregisteredTeam.run({
		auth: authed(ADMIN),
		data,
	} as unknown as CallableRequest<never>)

const failure = async (
	data: Record<string, unknown>
): Promise<{ code: string; message: string }> => {
	try {
		await run(data)
	} catch (error) {
		return error as { code: string; message: string }
	}
	throw new Error('expected the deletion to be refused')
}

/** TEAM in a season, with PLAYER on its roster on both sides. */
const seedTeamSeason = async (
	seasonId: string,
	registered = false
): Promise<void> => {
	await teamSeasonRef(firestore, TEAM, seasonId).set({
		season: firestore.doc(`seasons/${seasonId}`),
		name: 'The Discs',
		logo: null,
		storagePath: null,
		registered,
		registeredDate: null,
		placement: null,
	})
	await teamRosterEntryRef(firestore, TEAM, seasonId, PLAYER).set({
		player: firestore.doc(`players/${PLAYER}`),
		dateJoined: Timestamp.now(),
	})
	await playerSeasonRef(firestore, PLAYER, seasonId).set({
		season: firestore.doc(`seasons/${seasonId}`),
		team: firestore.doc(`teams/${TEAM}`),
		captain: true,
		paid: false,
		signed: false,
	})
}

const teamSeasonExists = async (seasonId: string): Promise<boolean> =>
	(await teamSeasonRef(firestore, TEAM, seasonId).get()).exists

beforeAll(async () => {
	firestore = initTestApp()
	const manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
	deleteUnregisteredTeam = manifest.deleteUnregisteredTeam as Callable
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seedAuthUser(ADMIN, true)
	await firestore.doc(`players/${ADMIN}`).set({
		admin: true,
		email: `${ADMIN}@example.com`,
		firstname: 'Ada',
		lastname: 'Admin',
	})
	await firestore.doc(`players/${PLAYER}`).set({
		admin: false,
		email: `${PLAYER}@example.com`,
		firstname: 'Pat',
		lastname: 'Lee',
	})
	await firestore.doc(`seasons/${PAST}`).set({
		name: '2025 Fall',
		dateStart: Timestamp.fromMillis(Date.now() - 300 * DAY_MS),
	})
	await firestore.doc(`seasons/${CURRENT}`).set({
		name: '2026 Fall',
		dateStart: Timestamp.fromMillis(Date.now() + 30 * DAY_MS),
	})
	await firestore.doc(`teams/${TEAM}`).set({})
})

describe('deleteUnregisteredTeam', () => {
	it('deletes the team from the current season and frees its players', async () => {
		await seedTeamSeason(CURRENT)

		await expect(
			run({ teamId: TEAM, seasonId: CURRENT })
		).resolves.toMatchObject({ success: true, playersRemoved: 1 })

		expect(await teamSeasonExists(CURRENT)).toBe(false)
		expect(
			(await playerSeasonRef(firestore, PLAYER, CURRENT).get()).data()?.team
		).toBeNull()
	})

	it('refuses a past season rather than deleting the current one', async () => {
		await seedTeamSeason(PAST)
		await seedTeamSeason(CURRENT)

		const error = await failure({ teamId: TEAM, seasonId: PAST })

		expect(error.code).toBe('failed-precondition')
		expect(error.message).toBe(
			'Only teams in the current season, 2026 Fall, can be deleted.'
		)
		expect(await teamSeasonExists(PAST)).toBe(true)
		expect(await teamSeasonExists(CURRENT)).toBe(true)
	})

	it('requires the season', async () => {
		await seedTeamSeason(CURRENT)

		const error = await failure({ teamId: TEAM })

		expect(error.code).toBe('invalid-argument')
		expect(await teamSeasonExists(CURRENT)).toBe(true)
	})

	it('refuses a registered team', async () => {
		await seedTeamSeason(CURRENT, true)

		const error = await failure({ teamId: TEAM, seasonId: CURRENT })

		expect(error.code).toBe('failed-precondition')
		expect(error.message).toMatch(/registered/)
		expect(await teamSeasonExists(CURRENT)).toBe(true)
	})
})
