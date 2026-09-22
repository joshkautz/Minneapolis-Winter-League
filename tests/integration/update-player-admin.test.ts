import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getAuth } from 'firebase-admin/auth'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	seedAuthUser,
} from './helpers.js'
import { updatePlayerAdmin } from '../../Functions/src/index.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'

/**
 * `updatePlayerAdmin` is the admin escape hatch for player state, and the one
 * place in the codebase that grants admin. Admin is the `admin` boolean on
 * the player document — not a token claim — so this callable writing it is
 * the entire privilege-escalation surface.
 *
 * It also moves players between teams, which has to write both sides of the
 * player/team relationship, and enforces the last-captain rule that keeps a
 * team from ending up with nobody able to manage it.
 */

const ADMIN = 'admin-uid'
const PLAYER = 'player-1'
const SEASON = 'season-1'
const TEAM = 'team-1'
const OTHER_TEAM = 'team-2'

let firestore: Firestore

const call = async (data: unknown) =>
	await updatePlayerAdmin.run({
		auth: authed(ADMIN),
		data,
	} as unknown as CallableRequest<never>)

const fails = async (data: unknown) =>
	await errorCodeFrom(updatePlayerAdmin, { auth: authed(ADMIN), data })

const playerRef = (playerId: string) =>
	firestore.collection('players').doc(playerId)
const teamRef = (teamId: string) => firestore.collection('teams').doc(teamId)
const seasonRef = () => firestore.collection('seasons').doc(SEASON)

const readPlayer = async (playerId = PLAYER) =>
	(await playerRef(playerId).get()).data()
const readSeason = async (playerId = PLAYER) =>
	(await playerSeasonRef(firestore, playerId, SEASON).get()).data()
const rosterIds = async (teamId: string) =>
	(
		await teamSeasonRef(firestore, teamId, SEASON).collection('roster').get()
	).docs
		.map((doc) => doc.id)
		.sort()

const seedTeam = async (teamId: string) => {
	await teamRef(teamId).set({ createdAt: Timestamp.now(), createdBy: null })
	await teamSeasonRef(firestore, teamId, SEASON).set({
		season: seasonRef(),
		name: teamId,
		logo: null,
		storagePath: null,
		registered: false,
		registeredDate: null,
		placement: null,
	})
}

const seedPlayer = async (
	playerId: string,
	options: {
		admin?: boolean
		teamId?: string | null
		captain?: boolean
		paid?: boolean
		signed?: boolean
		banned?: boolean
	} = {}
) => {
	await playerRef(playerId).set({
		admin: options.admin ?? false,
		email: `${playerId}@example.com`,
		firstname: playerId,
		lastname: 'Player',
	})
	await playerSeasonRef(firestore, playerId, SEASON).set({
		season: seasonRef(),
		team: options.teamId ? teamRef(options.teamId) : null,
		captain: options.captain ?? false,
		paid: options.paid ?? false,
		signed: options.signed ?? false,
		banned: options.banned ?? false,
	})
	if (options.teamId) {
		await teamRosterEntryRef(firestore, options.teamId, SEASON, playerId).set({
			player: playerRef(playerId),
			dateJoined: Timestamp.now(),
		})
	}
}

/** The full season payload the callable requires; every field is mandatory. */
const seasonUpdate = (overrides: Record<string, unknown> = {}) => ({
	seasonId: SEASON,
	captain: false,
	paid: false,
	signed: false,
	teamId: null,
	...overrides,
})

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await playerRef(ADMIN).set({ admin: true, email: `${ADMIN}@example.com` })
	await seasonRef().set({ name: '2030 Winter' })
	await seedTeam(TEAM)
	await seedTeam(OTHER_TEAM)
})

describe('updatePlayerAdmin: player document', () => {
	it('grants admin', async () => {
		await seedPlayer(PLAYER)

		await call({ playerId: PLAYER, admin: true })

		expect((await readPlayer())?.admin).toBe(true)
	})

	it('revokes admin', async () => {
		await seedPlayer(PLAYER, { admin: true })

		await call({ playerId: PLAYER, admin: false })

		expect((await readPlayer())?.admin).toBe(false)
	})

	it('refuses to remove the only administrator', async () => {
		// There is no in-app recovery from this. Admin is a field on the
		// player document rather than a token claim, so it cannot be restored
		// from the Firebase console's user editor — only by editing Firestore
		// directly, which is not something a league organiser can do.
		expect(await fails({ playerId: ADMIN, admin: false })).toBe(
			'failed-precondition'
		)
		expect((await readPlayer(ADMIN))?.admin).toBe(true)
	})

	it('lets an admin step down once another admin exists', async () => {
		// Stepping down is legitimate; only being the last one is not.
		await seedPlayer('second-admin', { admin: true })

		await call({ playerId: ADMIN, admin: false })

		expect((await readPlayer(ADMIN))?.admin).toBe(false)
	})

	it('allows demoting another admin, which always leaves the caller', async () => {
		// The caller must be an admin to get here, so demoting anyone else can
		// never be the last one — the guard only ever bites on self-demotion.
		await seedPlayer(PLAYER, { admin: true })

		await call({ playerId: PLAYER, admin: false })

		expect((await readPlayer(PLAYER))?.admin).toBe(false)
	})

	it('leaves other fields unwritten when the last-admin rule refuses', async () => {
		await fails({ playerId: ADMIN, admin: false, firstname: 'Renamed' })

		expect((await readPlayer(ADMIN))?.firstname).toBeUndefined()
	})

	it('renames a player and trims the input', async () => {
		await seedPlayer(PLAYER)

		await call({ playerId: PLAYER, firstname: '  Josh  ', lastname: 'Kautz' })
		const player = await readPlayer()

		expect(player?.firstname).toBe('Josh')
		expect(player?.lastname).toBe('Kautz')
	})

	it('reports only the fields that actually changed', async () => {
		await seedPlayer(PLAYER)

		const result = (await call({
			playerId: PLAYER,
			firstname: PLAYER,
			lastname: 'Changed',
		})) as { changes: Record<string, unknown> }

		expect(Object.keys(result.changes)).toEqual(['lastname'])
	})

	it('syncs an email change to Firebase Auth', async () => {
		// The Firestore copy is what the App reads and the Auth record is what
		// the player signs in with. A change that only lands in one of them
		// locks someone out of an account that looks correct.
		await seedPlayer(PLAYER)
		await seedAuthUser(PLAYER, false)

		await call({ playerId: PLAYER, email: 'New.Address@Example.com' })

		expect((await readPlayer())?.email).toBe('new.address@example.com')
		const authUser = await getAuth().getUser(PLAYER)
		expect(authUser.email).toBe('new.address@example.com')
	})

	it('treats an admin-set email as verified', async () => {
		// An admin typing the address is the verification; requiring the
		// player to re-verify would block them from a season they paid for.
		await seedPlayer(PLAYER)
		await seedAuthUser(PLAYER, false)

		await call({ playerId: PLAYER, email: 'verified@example.com' })

		expect((await getAuth().getUser(PLAYER)).emailVerified).toBe(true)
	})

	it('toggles email verification on its own', async () => {
		await seedPlayer(PLAYER)
		await seedAuthUser(PLAYER, false)

		await call({ playerId: PLAYER, emailVerified: true })

		expect((await getAuth().getUser(PLAYER)).emailVerified).toBe(true)
	})

	it.each([
		['no fields at all', {}],
		['an empty first name', { firstname: '   ' }],
		['a malformed email', { email: 'not-an-email' }],
		['a non-boolean admin flag', { admin: 'yes' }],
	])('rejects %s', async (_label, patch) => {
		await seedPlayer(PLAYER)

		expect(await fails({ playerId: PLAYER, ...patch })).toBe('invalid-argument')
	})

	it('rejects a missing player id', async () => {
		expect(await fails({ admin: true })).toBe('invalid-argument')
	})

	it('rejects a player that does not exist', async () => {
		expect(await fails({ playerId: 'ghost', admin: true })).toBe('not-found')
	})
})

describe('updatePlayerAdmin: season state', () => {
	it('marks a player paid and signed', async () => {
		await seedPlayer(PLAYER)

		await call({
			playerId: PLAYER,
			seasons: [seasonUpdate({ paid: true, signed: true })],
		})
		const season = await readSeason()

		expect(season?.paid).toBe(true)
		expect(season?.signed).toBe(true)
	})

	it('bans a player for a season', async () => {
		await seedPlayer(PLAYER)

		await call({ playerId: PLAYER, seasons: [seasonUpdate({ banned: true })] })

		expect((await readSeason())?.banned).toBe(true)
	})

	it('leaves banned alone when the field is omitted', async () => {
		await seedPlayer(PLAYER, { banned: true })

		await call({ playerId: PLAYER, seasons: [seasonUpdate({ paid: true })] })

		expect((await readSeason())?.banned).toBe(true)
	})

	it('adds a player to a team, writing both sides', async () => {
		await seedPlayer(PLAYER)

		await call({
			playerId: PLAYER,
			seasons: [seasonUpdate({ teamId: TEAM })],
		})

		expect((await readSeason())?.team.path).toBe(`teams/${TEAM}`)
		expect(await rosterIds(TEAM)).toEqual([PLAYER])
	})

	it('moves a player between teams, clearing the old roster', async () => {
		await seedPlayer(PLAYER, { teamId: TEAM })

		await call({
			playerId: PLAYER,
			seasons: [seasonUpdate({ teamId: OTHER_TEAM })],
		})

		expect((await readSeason())?.team.path).toBe(`teams/${OTHER_TEAM}`)
		expect(await rosterIds(TEAM)).toEqual([])
		expect(await rosterIds(OTHER_TEAM)).toEqual([PLAYER])
	})

	it('removes a player from a team without deleting their season state', async () => {
		// The subdoc still carries paid/signed/banned, which stay true after
		// someone leaves a roster — they paid either way.
		await seedPlayer(PLAYER, { teamId: TEAM, paid: true, signed: true })

		await call({
			playerId: PLAYER,
			seasons: [seasonUpdate({ teamId: null, paid: true, signed: true })],
		})
		const season = await readSeason()

		expect(season?.team).toBeNull()
		expect(season?.paid).toBe(true)
		expect(await rosterIds(TEAM)).toEqual([])
	})

	it('promotes a player to captain', async () => {
		await seedPlayer(PLAYER, { teamId: TEAM })

		await call({
			playerId: PLAYER,
			seasons: [seasonUpdate({ teamId: TEAM, captain: true })],
		})

		expect((await readSeason())?.captain).toBe(true)
	})

	it('carries captain status onto the new team when a captain is moved', async () => {
		await seedPlayer(PLAYER, { teamId: TEAM, captain: true })
		await seedPlayer('co-captain', { teamId: TEAM, captain: true })

		await call({
			playerId: PLAYER,
			seasons: [seasonUpdate({ teamId: OTHER_TEAM, captain: true })],
		})

		expect((await readSeason())?.captain).toBe(true)
		expect(await rosterIds(OTHER_TEAM)).toEqual([PLAYER])
	})

	it('refuses to demote the only captain on a team', async () => {
		// A team with no captain cannot manage its own roster, and nothing in
		// the App offers a way to appoint one.
		await seedPlayer(PLAYER, { teamId: TEAM, captain: true })

		expect(
			await fails({
				playerId: PLAYER,
				seasons: [seasonUpdate({ teamId: TEAM, captain: false })],
			})
		).toBe('failed-precondition')
	})

	it('refuses to move the only captain off their team', async () => {
		await seedPlayer(PLAYER, { teamId: TEAM, captain: true })

		expect(
			await fails({
				playerId: PLAYER,
				seasons: [seasonUpdate({ teamId: OTHER_TEAM, captain: true })],
			})
		).toBe('failed-precondition')
	})

	it('allows demoting a captain when another remains', async () => {
		await seedPlayer(PLAYER, { teamId: TEAM, captain: true })
		await seedPlayer('co-captain', { teamId: TEAM, captain: true })

		await call({
			playerId: PLAYER,
			seasons: [seasonUpdate({ teamId: TEAM, captain: false })],
		})

		expect((await readSeason())?.captain).toBe(false)
		expect((await readSeason('co-captain'))?.captain).toBe(true)
	})

	it('leaves the team untouched when the last-captain rule refuses', async () => {
		await seedPlayer(PLAYER, { teamId: TEAM, captain: true })

		await fails({
			playerId: PLAYER,
			seasons: [seasonUpdate({ teamId: TEAM, captain: false, paid: true })],
		})
		const season = await readSeason()

		expect(season?.captain).toBe(true)
		expect(season?.paid).toBe(false)
		expect(await rosterIds(TEAM)).toEqual([PLAYER])
	})

	it('cancels pending offers when a player is placed on a team', async () => {
		// Otherwise a stale invitation stays live and the offer trigger could
		// move the player again behind the admin's back.
		await seedPlayer(PLAYER)
		await firestore
			.collection('offers')
			.doc('offer-1')
			.set({
				player: playerRef(PLAYER),
				team: teamRef(OTHER_TEAM),
				season: seasonRef(),
				status: 'pending',
				type: 'invitation',
				createdAt: Timestamp.now(),
			})

		await call({
			playerId: PLAYER,
			seasons: [seasonUpdate({ teamId: TEAM })],
		})

		expect(
			(await firestore.collection('offers').doc('offer-1').get()).data()?.status
		).toBe('canceled')
	})

	it('refuses a season the player has no subdoc for', async () => {
		// Season state is seeded by registration, not invented here — adding
		// one would create a player season with no payment history behind it.
		await seedPlayer(PLAYER)
		await firestore.collection('seasons').doc('season-2').set({ name: '2031' })

		expect(
			await fails({
				playerId: PLAYER,
				seasons: [seasonUpdate({ seasonId: 'season-2' })],
			})
		).toBe('invalid-argument')
	})

	it('refuses a team that is not playing that season', async () => {
		await seedPlayer(PLAYER)
		await teamRef('other-year-team').set({
			createdAt: Timestamp.now(),
			createdBy: null,
		})

		expect(
			await fails({
				playerId: PLAYER,
				seasons: [seasonUpdate({ teamId: 'other-year-team' })],
			})
		).toBe('invalid-argument')
	})

	it.each([
		['a missing seasonId', { seasonId: undefined }],
		['a non-boolean paid flag', { paid: 'yes' }],
		['a numeric teamId', { teamId: 7 }],
	])('rejects %s in a season update', async (_label, patch) => {
		await seedPlayer(PLAYER)

		expect(
			await fails({ playerId: PLAYER, seasons: [seasonUpdate(patch)] })
		).toBe('invalid-argument')
	})

	it('rejects seasons that is not an array', async () => {
		await seedPlayer(PLAYER)

		expect(await fails({ playerId: PLAYER, seasons: 'all' })).toBe(
			'invalid-argument'
		)
	})
})
