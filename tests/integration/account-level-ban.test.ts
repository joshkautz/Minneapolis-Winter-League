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
 * A ban is a fact about a person, not a season, and it lives on the player
 * document. It used to live on each season subdoc, with three separate paths
 * — createSeason, createTeam, rolloverTeam — copying it forward onto every
 * new one. That made it account-level in effect while making it impossible
 * to lift: clearing one season left the others set and the next
 * carry-forward reinstated it.
 *
 * The backfill has run over every player and the season field is gone. What
 * these pin is that one flag decides the answer everywhere, that lifting a
 * ban actually lifts it, and that residual `banned` data left on old season
 * subdocs cannot resurrect one.
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
	/**
	 * Residual data only. Nothing writes this field any more; it is seeded
	 * here to prove that leftovers on old documents are ignored.
	 */
	residualBanned?: boolean
) => {
	await playerSeasonRef(firestore, playerId, seasonId).set({
		season: seasonRef(seasonId),
		team: null,
		captain: false,
		paid: true,
		signed: true,
		...(residualBanned === undefined ? {} : { banned: residualBanned }),
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
	it('reports a banned player', async () => {
		await seedPlayer(PLAYER, { banned: true })

		expect(await isPlayerBanned(firestore, PLAYER)).toBe(true)
	})

	it('reports a player who is not banned', async () => {
		await seedPlayer(PLAYER, { banned: false })

		expect(await isPlayerBanned(firestore, PLAYER)).toBe(false)
	})

	it('ignores a leftover ban on an old season subdoc', async () => {
		// The field is no longer written, but production documents still
		// carry it. A lifted ban must stay lifted.
		await seedPlayer(PLAYER, { banned: false })
		await seedSeasonState(PLAYER, SEASON, true)

		expect(await isPlayerBanned(firestore, PLAYER)).toBe(false)
	})

	it('answers without needing any season subdoc', async () => {
		// The ban applies to the person, so it holds for a season they never
		// registered for — which is what stopped a banned player simply
		// waiting for the next season to open.
		await seedPlayer(PLAYER, { banned: true })

		expect(await isPlayerBanned(firestore, PLAYER)).toBe(true)
	})

	it('is false for a player document with no banned field', async () => {
		await seedPlayer(PLAYER)

		expect(await isPlayerBanned(firestore, PLAYER)).toBe(false)
	})
})

describe('validateNotBanned', () => {
	it('throws for a banned player', async () => {
		await seedPlayer(PLAYER, { banned: true })

		await expect(validateNotBanned(firestore, PLAYER)).rejects.toMatchObject({
			code: 'permission-denied',
		})
	})

	it('resolves for a player who is not banned', async () => {
		await seedPlayer(PLAYER, { banned: false })

		await expect(validateNotBanned(firestore, PLAYER)).resolves.toBeUndefined()
	})
})

describe('updatePlayerAdmin: league ban', () => {
	beforeEach(async () => {
		await seedPlayer(PLAYER, { banned: false })
		await seedSeasonState(PLAYER, SEASON)
		await seedSeasonState(PLAYER, OTHER_SEASON)
	})

	it('bans a player league-wide in one action', async () => {
		await call({ playerId: PLAYER, banned: true })

		expect((await readPlayer())?.banned).toBe(true)
		expect(await isPlayerBanned(firestore, PLAYER)).toBe(true)
	})

	it('lifts a ban in one action', async () => {
		// Previously impossible: the flag was per season, so clearing one
		// left the others set and the next carry-forward put it back.
		await call({ playerId: PLAYER, banned: true })

		await call({ playerId: PLAYER, banned: false })

		expect((await readPlayer())?.banned).toBe(false)
		expect(await isPlayerBanned(firestore, PLAYER)).toBe(false)
	})

	it('does not touch the season subdocs', async () => {
		// The ban is not season state any more, so a ban must not rewrite
		// documents it has nothing to do with.
		await call({ playerId: PLAYER, banned: true })
		const season = await readSeason(SEASON)

		expect(season?.banned).toBeUndefined()
		expect(season?.paid).toBe(true)
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
		await call({ playerId: PLAYER, banned: true })

		expect((await readPlayer())?.banned).toBe(true)
	})

	it('bans a player who has no seasons at all', async () => {
		await resetFirestore(firestore)
		await seedPlayer(ADMIN, { admin: true })
		await seedPlayer(PLAYER)

		await call({ playerId: PLAYER, banned: true })

		expect((await readPlayer())?.banned).toBe(true)
	})
})
