import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import { TEAM_CONFIG } from '../../Functions/src/config/constants.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'

/**
 * Firestore trigger tests.
 *
 * Triggers run unattended in production — nothing surfaces a failure to a
 * user, so a broken one degrades data quietly. firebase-functions exposes
 * `.run(event)` on every trigger for exactly this, so the real handler runs
 * against the emulator with a synthetic event.
 *
 * The migration kill-switch matters most: a long-running migration sets
 * `system/maintenance.migrationInProgress` and every trigger must then
 * early-return without writing, or the migration races its own fan-out.
 */

const MIN = TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const SEASON = 'season-1'
const TEAM = 'team-1'

const seasonRef = () => firestore.collection('seasons').doc(SEASON)
const teamRef = () => firestore.collection('teams').doc(TEAM)

/** A document snapshot shaped the way a trigger event carries one. */
const snap = (exists: boolean, data: Record<string, unknown>) => ({
	exists,
	data: () => (exists ? data : undefined),
})

const readTeamSeason = async () =>
	(await teamSeasonRef(firestore, TEAM, SEASON).get()).data()

/** Seeds a roster that is one paid+signed player short of registering. */
const seedAlmostRegistered = async (): Promise<void> => {
	for (let i = 0; i < MIN; i++) {
		const playerId = `player-${i}`
		await firestore
			.collection('players')
			.doc(playerId)
			.set({ admin: false, email: `${playerId}@example.com` })
		await teamRosterEntryRef(firestore, TEAM, SEASON, playerId).set({
			player: firestore.collection('players').doc(playerId),
			dateJoined: Timestamp.now(),
		})
		await playerSeasonRef(firestore, playerId, SEASON).set({
			season: seasonRef(),
			team: teamRef(),
			paid: true,
			// The last player has not signed, so the team is one short.
			signed: i < MIN - 1,
			banned: false,
			captain: i === 0,
		})
	}
}

beforeAll(async () => {
	firestore = initTestApp()
	manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seasonRef().set({ name: '2030 Winter' })
	await teamRef().set({ createdAt: Timestamp.now() })
	await teamSeasonRef(firestore, TEAM, SEASON).set({
		season: seasonRef(),
		name: 'Test Team',
		registered: false,
		registeredDate: null,
	})
})

describe('updateTeamRegistrationOnPlayerChange', () => {
	const fire = (
		before: Record<string, unknown>,
		after: Record<string, unknown>
	) =>
		manifest.updateTeamRegistrationOnPlayerChange.run({
			id: 'evt-1',
			params: { playerId: `player-${MIN - 1}`, seasonId: SEASON },
			data: { before: snap(true, before), after: snap(true, after) },
		})

	beforeEach(seedAlmostRegistered)

	it('registers the team when the last waiver is signed', async () => {
		const base = { season: seasonRef(), team: teamRef(), paid: true, banned: false }
		await fire({ ...base, signed: false }, { ...base, signed: true })

		// The trigger reads current Firestore state, so reflect the change.
		await playerSeasonRef(firestore, `player-${MIN - 1}`, SEASON).update({
			signed: true,
		})
		await fire({ ...base, signed: false }, { ...base, signed: true })

		expect((await readTeamSeason())?.registered).toBe(true)
	})

	it('does nothing when neither paid nor signed changed', async () => {
		// A captaincy change must not trigger a registration recompute.
		const base = {
			season: seasonRef(),
			team: teamRef(),
			paid: true,
			signed: true,
			banned: false,
		}
		await playerSeasonRef(firestore, `player-${MIN - 1}`, SEASON).update({
			signed: true,
		})
		await fire({ ...base, captain: false }, { ...base, captain: true })

		// registered is still false because the recompute never ran.
		expect((await readTeamSeason())?.registered).toBe(false)
	})

	it('does nothing when the player is not on a team', async () => {
		const base = { season: seasonRef(), team: null, paid: true, banned: false }
		await fire({ ...base, signed: false }, { ...base, signed: true })
		expect((await readTeamSeason())?.registered).toBe(false)
	})

	it('early-returns while a migration is in progress', async () => {
		// The kill-switch exists so a migration script can write canonical
		// documents without triggers racing it.
		await firestore.doc('system/maintenance').set({ migrationInProgress: true })
		await playerSeasonRef(firestore, `player-${MIN - 1}`, SEASON).update({
			signed: true,
		})

		const base = { season: seasonRef(), team: teamRef(), paid: true, banned: false }
		await fire({ ...base, signed: false }, { ...base, signed: true })

		expect((await readTeamSeason())?.registered).toBe(false)
	})

	it('swallows errors rather than crashing the trigger', async () => {
		// An unhandled throw would retry the event indefinitely.
		const base = { season: seasonRef(), team: teamRef(), paid: true, banned: false }
		await expect(
			manifest.updateTeamRegistrationOnPlayerChange.run({
				id: 'evt-2',
				params: { playerId: 'ghost', seasonId: 'no-such-season' },
				data: { before: snap(true, { ...base, signed: false }), after: snap(true, { ...base, signed: true }) },
			})
		).resolves.toBeUndefined()
	})
})

describe('updateTeamRegistrationOnRosterChange', () => {
	const fire = (beforeExists: boolean, afterExists: boolean) =>
		manifest.updateTeamRegistrationOnRosterChange.run({
			id: 'evt-1',
			params: { teamId: TEAM, seasonId: SEASON, playerId: 'player-0' },
			data: {
				before: snap(beforeExists, { dateJoined: Timestamp.now() }),
				after: snap(afterExists, { dateJoined: Timestamp.now() }),
			},
		})

	it('recomputes when a roster entry is created', async () => {
		await seedAlmostRegistered()
		await playerSeasonRef(firestore, `player-${MIN - 1}`, SEASON).update({
			signed: true,
		})

		await fire(false, true)
		expect((await readTeamSeason())?.registered).toBe(true)
	})

	it('recomputes when a roster entry is deleted', async () => {
		await seedAlmostRegistered()
		await playerSeasonRef(firestore, `player-${MIN - 1}`, SEASON).update({
			signed: true,
		})
		await fire(false, true)
		expect((await readTeamSeason())?.registered).toBe(true)

		await teamRosterEntryRef(firestore, TEAM, SEASON, 'player-0').delete()
		await fire(true, false)
		expect((await readTeamSeason())?.registered).toBe(false)
	})

	it('ignores an update to an existing roster entry', async () => {
		// Roster entries carry only player and dateJoined; editing one cannot
		// change the registration count, so the recompute is skipped.
		await seedAlmostRegistered()
		await playerSeasonRef(firestore, `player-${MIN - 1}`, SEASON).update({
			signed: true,
		})

		await fire(true, true)
		expect((await readTeamSeason())?.registered).toBe(false)
	})

	it('early-returns while a migration is in progress', async () => {
		await seedAlmostRegistered()
		await playerSeasonRef(firestore, `player-${MIN - 1}`, SEASON).update({
			signed: true,
		})
		await firestore.doc('system/maintenance').set({ migrationInProgress: true })

		await fire(false, true)
		expect((await readTeamSeason())?.registered).toBe(false)
	})
})
