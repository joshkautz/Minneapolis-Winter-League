import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeApp } from 'firebase-admin/app'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
	authed,
	type Callable,
	errorCodeFrom,
	initTestApp,
	PROJECT_ID,
	resetFirestore,
	seedAuthUser,
} from './helpers.js'
import {
	playerSeasonRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'
import { deleteTeamSeasonWithCleanup } from '../../Functions/src/services/teamDeletionService.js'

/**
 * Team logos through the Storage emulator: the size and type rules, that a
 * logo is only ever an uploaded file, and that deleting a team-season keeps
 * a logo its other seasons still show.
 */

// The helpers' app has no bucket; this one is created first, so theirs is it.
initializeApp({
	projectId: PROJECT_ID,
	storageBucket: `${PROJECT_ID}.appspot.com`,
})

let firestore: Firestore
let manifest: Record<string, unknown>
const fn = (name: string): Callable => manifest[name] as Callable

const SEASON = 'season-1'
const OLD_SEASON = 'season-0'
const PLAYER = 'player-1'

const png = (bytes: number): string => Buffer.alloc(bytes, 7).toString('base64')

const call = async (
	name: string,
	data: Record<string, unknown>
): Promise<unknown> =>
	fn(name).run({
		auth: authed(PLAYER),
		data,
	} as unknown as CallableRequest<never>)

const failure = async (
	name: string,
	data: Record<string, unknown>
): Promise<{ code: string; message: string }> => {
	try {
		await call(name, data)
	} catch (error) {
		return error as { code: string; message: string }
	}
	throw new Error('expected the call to fail')
}

const fileExists = async (path: string): Promise<boolean> =>
	(await getStorage().bucket().file(path).exists())[0]

const createdTeamId = async (): Promise<string> =>
	(await playerSeasonRef(firestore, PLAYER, SEASON).get()).data()!.team!.id

beforeAll(async () => {
	firestore = initTestApp()
	manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
})

beforeEach(async () => {
	await resetFirestore(firestore)
	const days = (n: number): Timestamp =>
		Timestamp.fromDate(new Date(Date.now() + n * 24 * 60 * 60 * 1000))
	await firestore.doc(`seasons/${SEASON}`).set({
		name: '2030 Winter',
		dateStart: days(30),
		dateEnd: days(90),
		registrationStart: days(-10),
		registrationEnd: days(10),
	})
	await seedAuthUser(PLAYER, true)
	await firestore
		.doc(`players/${PLAYER}`)
		.set({ admin: false, firstname: 'Test', lastname: 'Player' })
})

describe('createTeam logos', () => {
	it('stores an accepted logo under teams/ and records it', async () => {
		await call('createTeam', {
			name: 'Test Team',
			seasonId: SEASON,
			logoBlob: png(2048),
			logoContentType: 'image/png',
		})

		const teamSeason = (
			await teamSeasonRef(firestore, await createdTeamId(), SEASON).get()
		).data()
		expect(teamSeason?.storagePath).toMatch(/^teams\//)
		expect(teamSeason?.logo).toContain(
			encodeURIComponent(teamSeason!.storagePath!)
		)
		expect(await fileExists(teamSeason!.storagePath!)).toBe(true)
	})

	it('refuses a logo over 5 MB, saying so, and creates no team', async () => {
		const error = await failure('createTeam', {
			name: 'Test Team',
			seasonId: SEASON,
			logoBlob: png(6 * 1024 * 1024),
			logoContentType: 'image/jpeg',
		})

		expect(error.code).toBe('invalid-argument')
		expect(error.message).toMatch(
			/^The logo is 6\.0 MB, and the limit is 5\.0 MB/
		)
		const playerSeason = await playerSeasonRef(firestore, PLAYER, SEASON).get()
		expect(playerSeason.data()?.team ?? null).toBeNull()
	})

	it('refuses an SVG logo', async () => {
		const error = await failure('createTeam', {
			name: 'Test Team',
			seasonId: SEASON,
			logoBlob: png(100),
			logoContentType: 'image/svg+xml',
		})
		expect(error.message).toBe(
			'The logo must be a PNG, JPEG, GIF or WebP image.'
		)
	})
})

describe('updateTeam logos', () => {
	it('ignores a Storage path sent by the client', async () => {
		// A captain could otherwise point their team at another team's file,
		// then delete their team and take that file with it.
		await call('createTeam', { name: 'Test Team', seasonId: SEASON })
		const teamId = await createdTeamId()

		await call('updateTeam', {
			teamId,
			seasonId: SEASON,
			name: 'Renamed',
			logo: 'https://example.com/elsewhere.png',
			storagePath: 'badges/someone-else',
		})

		const teamSeason = (
			await teamSeasonRef(firestore, teamId, SEASON).get()
		).data()
		expect(teamSeason?.name).toBe('Renamed')
		expect(teamSeason?.logo).toBeNull()
		expect(teamSeason?.storagePath).toBeNull()
	})

	it('replaces the logo with an uploaded one', async () => {
		await call('createTeam', { name: 'Test Team', seasonId: SEASON })
		const teamId = await createdTeamId()

		await call('updateTeam', {
			teamId,
			seasonId: SEASON,
			logoBlob: png(1024),
			logoContentType: 'image/webp',
		})

		const teamSeason = (
			await teamSeasonRef(firestore, teamId, SEASON).get()
		).data()
		expect(await fileExists(teamSeason!.storagePath!)).toBe(true)
	})
})

describe('deleting a team-season with a logo', () => {
	const seedLogo = async (path: string): Promise<void> => {
		await getStorage().bucket().file(path).save(Buffer.from('logo'))
	}
	const seedSeasonWithLogo = async (
		teamId: string,
		seasonId: string,
		storagePath: string
	): Promise<void> => {
		await firestore.doc(`teams/${teamId}`).set({ createdAt: Timestamp.now() })
		await teamSeasonRef(firestore, teamId, seasonId).set({
			season: firestore.doc(`seasons/${seasonId}`),
			name: 'Logo Team',
			logo: 'https://example.com/logo.png',
			storagePath,
			registered: false,
			registeredDate: null,
			placement: null,
		} as never)
	}

	it('deletes a logo no other season uses', async () => {
		await seedLogo('teams/only-this-season')
		await seedSeasonWithLogo('team-a', SEASON, 'teams/only-this-season')

		await deleteTeamSeasonWithCleanup(firestore, 'team-a', SEASON)

		expect(await fileExists('teams/only-this-season')).toBe(false)
	})

	it('keeps a logo a rolled-over team’s earlier season still shows', async () => {
		await seedLogo('teams/shared')
		await seedSeasonWithLogo('team-b', OLD_SEASON, 'teams/shared')
		await seedSeasonWithLogo('team-b', SEASON, 'teams/shared')

		await deleteTeamSeasonWithCleanup(firestore, 'team-b', SEASON)

		expect(await fileExists('teams/shared')).toBe(true)
	})

	it('never deletes a file outside teams/', async () => {
		await seedLogo('badges/not-a-logo')
		await seedSeasonWithLogo('team-c', SEASON, 'badges/not-a-logo')

		await deleteTeamSeasonWithCleanup(firestore, 'team-c', SEASON)

		expect(await fileExists('badges/not-a-logo')).toBe(true)
	})
})

describe('team deletion refusals', () => {
	it('reach the captain with their own code and message', async () => {
		// A refusal from the deletion service used to arrive as `internal`.
		await call('createTeam', { name: 'Test Team', seasonId: SEASON })
		const teamId = await createdTeamId()
		await teamSeasonRef(firestore, teamId, SEASON)
			.collection('contributions')
			.doc('pi_1')
			.set({ status: 'paid', amountCents: 10_000 })

		const error = await failure('deleteTeam', { teamId, seasonId: SEASON })

		expect(error.code).toBe('failed-precondition')
		expect(error.message).toMatch(/still holds money/)
	})
})
