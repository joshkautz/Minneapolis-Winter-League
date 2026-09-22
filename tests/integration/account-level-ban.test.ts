import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
} from './helpers.js'
import { updatePlayerAdmin } from '../../Functions/src/index.js'
import {
	isPlayerBanned,
	validateNotBanned,
} from '../../Functions/src/shared/auth.js'
import { playerSeasonRef } from '../../Functions/src/shared/database.js'

/**
 * A ban is a fact about a person, not a season, and it now lives on the
 * player document. It used to live on each season subdoc, with three
 * separate paths — createSeason, createTeam, rolloverTeam — copying it
 * forward onto every new one. That already made it account-level in effect,
 * but it also made it impossible to lift: clearing one season left the
 * others set and the next carry-forward reinstated it.
 *
 * The backfill has not run everywhere, so reads still fall back to the
 * season subdocs for any player missing the new field. These tests pin both
 * halves — the new field wins where present, the old one still counts where
 * it does not — and the un-ban that was previously impossible.
 */

const ADMIN = 'admin-uid'
const PLAYER = 'player-1'
const SEASON = 'season-1'
const OTHER_SEASON = 'season-2'

let firestore: Firestore

const playerRef = (playerId: string) =>
	firestore.collection('players').doc(playerId)
const seasonRef = (seasonId: string) =>
	firestore.collection('seasons').doc(seasonId)

const call = (data: unknown) =>
	updatePlayerAdmin.run({
		auth: authed(ADMIN),
		data,
	} as unknown as CallableRequest<never>)

const seedPlayer = async (
	playerId: string,
	options: { admin?: boolean; banned?: boolean } = {}
) => {
	await playerRef(playerId).set({
		admin: options.admin ?? false,
		email: `${playerId}@example.com`,
		firstname: 'Test',
		lastname: 'Player',
		// Only set when specified, so "not migrated" is representable.
		...(options.banned === undefined ? {} : { banned: options.banned }),
	})
}

const seedSeasonState = async (
	playerId: string,
	seasonId: string,
	banned: boolean
) => {
	await playerSeasonRef(firestore, playerId, seasonId).set({
		season: seasonRef(seasonId),
		team: null,
		captain: false,
		paid: true,
		signed: true,
		banned,
	})
}

const readPlayer = async (playerId = PLAYER) =>
	(await playerRef(playerId).get()).data()
const readSeason = async (seasonId = SEASON) =>
	(await playerSeasonRef(firestore, PLAYER, seasonId).get()).data()

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seedPlayer(ADMIN, { admin: true })
	await seasonRef(SEASON).set({ name: '2030 Winter' })
	await seasonRef(OTHER_SEASON).set({ name: '2031 Winter' })
})

describe('isPlayerBanned', () => {
	it('uses the player document when it has the field', async () => {
		await seedPlayer(PLAYER, { banned: true })
		await seedSeasonState(PLAYER, SEASON, false)

		expect(await isPlayerBanned(firestore, PLAYER, SEASON)).toBe(true)
	})

	it('lets the player document clear a stale season flag', async () => {
		// This is the whole point of the move. The season subdoc still says
		// banned; the player document is the answer and says otherwise.
		await seedPlayer(PLAYER, { banned: false })
		await seedSeasonState(PLAYER, SEASON, true)

		expect(await isPlayerBanned(firestore, PLAYER, SEASON)).toBe(false)
	})

	it('falls back to the asked-about season before the backfill', async () => {
		await seedPlayer(PLAYER)
		await seedSeasonState(PLAYER, SEASON, true)

		expect(await isPlayerBanned(firestore, PLAYER, SEASON)).toBe(true)
	})

	it('falls back to any other season before the backfill', async () => {
		// Banned in one season means banned, which is what the three
		// carry-forward sites already assumed.
		await seedPlayer(PLAYER)
		await seedSeasonState(PLAYER, SEASON, false)
		await seedSeasonState(PLAYER, OTHER_SEASON, true)

		expect(await isPlayerBanned(firestore, PLAYER, SEASON)).toBe(true)
	})

	it('is false for an unmigrated player banned nowhere', async () => {
		await seedPlayer(PLAYER)
		await seedSeasonState(PLAYER, SEASON, false)
		await seedSeasonState(PLAYER, OTHER_SEASON, false)

		expect(await isPlayerBanned(firestore, PLAYER, SEASON)).toBe(false)
	})

	it('is false for a player with no seasons at all', async () => {
		await seedPlayer(PLAYER)

		expect(await isPlayerBanned(firestore, PLAYER, SEASON)).toBe(false)
	})

	it('answers for a season the player has no subdoc for', async () => {
		// A banned player must stay banned for a season they never joined,
		// or the ban is lifted by the season rolling over.
		await seedPlayer(PLAYER)
		await seedSeasonState(PLAYER, OTHER_SEASON, true)

		expect(await isPlayerBanned(firestore, PLAYER, SEASON)).toBe(true)
	})
})

describe('validateNotBanned', () => {
	it('throws for a banned player', async () => {
		await seedPlayer(PLAYER, { banned: true })

		await expect(
			validateNotBanned(firestore, PLAYER, SEASON)
		).rejects.toMatchObject({ code: 'permission-denied' })
	})

	it('resolves for a player who is not banned', async () => {
		await seedPlayer(PLAYER, { banned: false })

		await expect(
			validateNotBanned(firestore, PLAYER, SEASON)
		).resolves.toBeUndefined()
	})
})

describe('updatePlayerAdmin: league ban', () => {
	beforeEach(async () => {
		await seedPlayer(PLAYER)
		await seedSeasonState(PLAYER, SEASON, false)
		await seedSeasonState(PLAYER, OTHER_SEASON, false)
	})

	it('bans a player league-wide in one action', async () => {
		await call({ playerId: PLAYER, banned: true })

		expect((await readPlayer())?.banned).toBe(true)
		expect(await isPlayerBanned(firestore, PLAYER, SEASON)).toBe(true)
	})

	it('mirrors the ban onto every season subdoc', async () => {
		// The mirror keeps the fallback honest while it still exists. Without
		// it, a player banned here would read as unbanned by any code path
		// still consulting a season.
		await call({ playerId: PLAYER, banned: true })

		expect((await readSeason(SEASON))?.banned).toBe(true)
		expect((await readSeason(OTHER_SEASON))?.banned).toBe(true)
	})

	it('lifts a ban that spans several seasons', async () => {
		// Previously impossible: clearing one season left the others set and
		// the next carry-forward put it back.
		await seedSeasonState(PLAYER, SEASON, true)
		await seedSeasonState(PLAYER, OTHER_SEASON, true)

		await call({ playerId: PLAYER, banned: false })

		expect((await readPlayer())?.banned).toBe(false)
		expect((await readSeason(SEASON))?.banned).toBe(false)
		expect((await readSeason(OTHER_SEASON))?.banned).toBe(false)
		expect(await isPlayerBanned(firestore, PLAYER, SEASON)).toBe(false)
	})

	it('reports the change it made', async () => {
		const result = (await call({ playerId: PLAYER, banned: true })) as {
			changes: { banned?: { from: boolean; to: boolean } }
		}

		expect(result.changes.banned).toEqual({ from: false, to: true })
	})

	it('reports no change when the ban is already set', async () => {
		await call({ playerId: PLAYER, banned: true })

		const result = (await call({ playerId: PLAYER, banned: true })) as {
			changes: { banned?: unknown }
		}

		expect(result.changes.banned).toBeUndefined()
	})

	it('rejects a non-boolean ban', async () => {
		expect(
			await errorCodeFrom(updatePlayerAdmin, {
				auth: authed(ADMIN),
				data: { playerId: PLAYER, banned: 'yes' },
			})
		).toBe('invalid-argument')
	})

	it('accepts a ban as the only field in the request', async () => {
		// It is not a season field any more, so it has to stand alone.
		await call({ playerId: PLAYER, banned: true })

		expect((await readPlayer())?.banned).toBe(true)
	})

	it('leaves a player with no seasons bannable', async () => {
		await resetFirestore(firestore)
		await seedPlayer(ADMIN, { admin: true })
		await seasonRef(SEASON).set({ name: '2030 Winter' })
		await seedPlayer(PLAYER)

		await call({ playerId: PLAYER, banned: true })

		expect((await readPlayer())?.banned).toBe(true)
	})
})

describe('the ban follows the player into a new season', () => {
	it('stays banned when a season subdoc is created later', async () => {
		// The carry-forward sites now read the account-level flag, so a new
		// subdoc inherits it rather than re-deriving it from its siblings.
		await seedPlayer(PLAYER, { banned: true })

		await playerSeasonRef(firestore, PLAYER, OTHER_SEASON).set({
			season: seasonRef(OTHER_SEASON),
			team: null,
			captain: false,
			paid: false,
			signed: false,
			banned: await isPlayerBanned(firestore, PLAYER, OTHER_SEASON),
		})

		expect((await readSeason(OTHER_SEASON))?.banned).toBe(true)
	})
})

describe('a player document without the field', () => {
	it('is treated as unmigrated rather than unbanned', async () => {
		// The distinction matters: `undefined` means "ask the seasons", and
		// reading it as `false` would silently unban everyone the backfill
		// has not reached yet.
		await seedPlayer(PLAYER)
		await seedSeasonState(PLAYER, SEASON, true)
		const stored = await readPlayer()

		expect(stored?.banned).toBeUndefined()
		expect(await isPlayerBanned(firestore, PLAYER, SEASON)).toBe(true)
	})
})

describe('timestamps are untouched', () => {
	it('does not disturb other season fields when mirroring', async () => {
		await seedPlayer(PLAYER)
		await playerSeasonRef(firestore, PLAYER, SEASON).set({
			season: seasonRef(SEASON),
			team: null,
			captain: true,
			paid: true,
			signed: true,
			banned: false,
			joinedAt: Timestamp.fromMillis(1_000),
		})

		await call({ playerId: PLAYER, banned: true })
		const season = await readSeason(SEASON)

		expect(season?.banned).toBe(true)
		expect(season?.captain).toBe(true)
		expect(season?.paid).toBe(true)
		expect(season?.joinedAt.toMillis()).toBe(1_000)
	})
})
