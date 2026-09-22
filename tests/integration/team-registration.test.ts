import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import { updateTeamRegistrationStatus } from '../../Functions/src/services/teamRegistrationService.js'
import { isMigrationInProgress } from '../../Functions/src/shared/maintenance.js'
import { TEAM_CONFIG } from '../../Functions/src/config/constants.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'

/**
 * Team registration is the rule that decides whether a team counts as
 * registered for a season: at least MIN_PLAYERS_FOR_REGISTRATION roster
 * members who are both paid *and* signed. It drives the public teams list,
 * the admin registration view and the season lock, and it is recomputed by
 * Firestore triggers rather than by any callable — so nothing else in the
 * test suite exercises it.
 */

const MIN = TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION

let firestore: Firestore
const SEASON = 'season-1'
const TEAM = 'team-1'

const seasonRef = () => firestore.collection('seasons').doc(SEASON)

/** Puts `count` players on the roster with the given paid/signed state. */
const seedRoster = async (
	count: number,
	state: { paid: boolean; signed: boolean }
): Promise<string[]> => {
	const ids: string[] = []
	for (let i = 0; i < count; i++) {
		const playerId = `player-${i}`
		ids.push(playerId)
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
			team: firestore.collection('teams').doc(TEAM),
			paid: state.paid,
			signed: state.signed,
			captain: i === 0,
		})
	}
	return ids
}

const readTeamSeason = async () =>
	(await teamSeasonRef(firestore, TEAM, SEASON).get()).data()

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seasonRef().set({ name: '2030 Winter' })
	await firestore
		.collection('teams')
		.doc(TEAM)
		.set({ createdAt: Timestamp.now() })
	await teamSeasonRef(firestore, TEAM, SEASON).set({
		season: seasonRef(),
		name: 'Test Team',
		registered: false,
		registeredDate: null,
	})
})

describe('updateTeamRegistrationStatus', () => {
	it(`does not register a team one short of the ${MIN}-player threshold`, async () => {
		await seedRoster(MIN - 1, { paid: true, signed: true })
		await updateTeamRegistrationStatus(TEAM, SEASON)
		expect((await readTeamSeason())?.registered).toBe(false)
	})

	it(`registers a team that reaches exactly ${MIN}`, async () => {
		await seedRoster(MIN, { paid: true, signed: true })
		await updateTeamRegistrationStatus(TEAM, SEASON)

		const data = await readTeamSeason()
		expect(data?.registered).toBe(true)
		// The date is what the admin UI sorts registration order by.
		expect(data?.registeredDate).toBeTruthy()
	})

	it('counts only players who are both paid and signed', async () => {
		// Paid but unsigned is the common real case: payment went through,
		// the waiver has not been returned. It must not count.
		await seedRoster(MIN, { paid: true, signed: false })
		await updateTeamRegistrationStatus(TEAM, SEASON)
		expect((await readTeamSeason())?.registered).toBe(false)

		await seedRoster(MIN, { paid: false, signed: true })
		await updateTeamRegistrationStatus(TEAM, SEASON)
		expect((await readTeamSeason())?.registered).toBe(false)
	})

	it('unregisters a team that drops below the threshold', async () => {
		const ids = await seedRoster(MIN, { paid: true, signed: true })
		await updateTeamRegistrationStatus(TEAM, SEASON)
		expect((await readTeamSeason())?.registered).toBe(true)

		// One player's waiver is revoked.
		await playerSeasonRef(firestore, ids[0], SEASON).update({ signed: false })
		await updateTeamRegistrationStatus(TEAM, SEASON)

		const data = await readTeamSeason()
		expect(data?.registered).toBe(false)
		// The date must be cleared, or the team keeps a registration date it
		// no longer has.
		expect(data?.registeredDate).toBeNull()
	})

	it('ignores a roster entry whose player season subdoc is missing', async () => {
		await seedRoster(MIN, { paid: true, signed: true })
		await playerSeasonRef(firestore, 'player-0', SEASON).delete()
		await updateTeamRegistrationStatus(TEAM, SEASON)
		expect((await readTeamSeason())?.registered).toBe(false)
	})

	it('handles an empty roster without registering the team', async () => {
		await updateTeamRegistrationStatus(TEAM, SEASON)
		expect((await readTeamSeason())?.registered).toBe(false)
	})

	it('returns quietly when the team season does not exist', async () => {
		await expect(
			updateTeamRegistrationStatus('no-such-team', SEASON)
		).resolves.toBeUndefined()
	})

	it('leaves the document untouched when the status has not changed', async () => {
		await seedRoster(MIN, { paid: true, signed: true })
		await updateTeamRegistrationStatus(TEAM, SEASON)
		const first = await readTeamSeason()

		await updateTeamRegistrationStatus(TEAM, SEASON)
		const second = await readTeamSeason()

		// A rewrite would move registeredDate and reshuffle registration order.
		expect(second?.registeredDate?.toMillis()).toBe(
			first?.registeredDate?.toMillis()
		)
	})
})

describe('isMigrationInProgress', () => {
	it('is false when the flag document does not exist', async () => {
		await expect(isMigrationInProgress(firestore)).resolves.toBe(false)
	})

	it('is true only when migrationInProgress is exactly true', async () => {
		await firestore.doc('system/maintenance').set({ migrationInProgress: true })
		await expect(isMigrationInProgress(firestore)).resolves.toBe(true)

		await firestore
			.doc('system/maintenance')
			.set({ migrationInProgress: false })
		await expect(isMigrationInProgress(firestore)).resolves.toBe(false)

		// A truthy non-boolean must not switch the kill-switch on.
		await firestore
			.doc('system/maintenance')
			.set({ migrationInProgress: 'yes' })
		await expect(isMigrationInProgress(firestore)).resolves.toBe(false)
	})
})
