import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import { TEAM_CONFIG } from '../../Functions/src/config/constants.js'
import { updateTeamRegistrationStatus } from '../../Functions/src/services/teamRegistrationService.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'

/**
 * Registering a team is a race for a limited number of spots, and it is about
 * to become a race with money attached. These cover the gate itself: that a
 * team cannot take a spot that is not there, that the count is claimed
 * atomically, and that a claimed spot is never given back.
 *
 * The old behaviour — set `registered` from the roster count and let a
 * trigger tidy up afterwards — is covered in registration-lock.test.ts, which
 * documents what that trigger does and does not guarantee.
 */

const MIN = TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION
const CAP = TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK
const SEASON = 'season-1'

let firestore: Firestore

const seasonRef = () => firestore.collection('seasons').doc(SEASON)

const seedTeam = async (teamId: string) => {
	await firestore
		.collection('teams')
		.doc(teamId)
		.set({ createdAt: Timestamp.now(), createdBy: null })
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

/** Puts `count` qualifying (paid + signed) players on a team's roster. */
const seedQualifyingRoster = async (teamId: string, count: number) => {
	for (let i = 0; i < count; i++) {
		const playerId = `${teamId}-player-${i}`
		await firestore
			.collection('players')
			.doc(playerId)
			.set({ admin: false, email: `${playerId}@example.com`, banned: false })
		await teamRosterEntryRef(firestore, teamId, SEASON, playerId).set({
			player: firestore.collection('players').doc(playerId),
			dateJoined: Timestamp.now(),
		})
		await playerSeasonRef(firestore, playerId, SEASON).set({
			season: seasonRef(),
			team: firestore.collection('teams').doc(teamId),
			paid: true,
			signed: true,
			captain: i === 0,
		})
	}
}

const isRegistered = async (teamId: string) =>
	(await teamSeasonRef(firestore, teamId, SEASON).get()).data()?.registered

const spotsClaimed = async () =>
	(await seasonRef().get()).data()?.registeredTeamCount

/** Fills the season to `count` claimed spots using throwaway teams. */
const fillSeason = async (count: number) => {
	for (let i = 0; i < count; i++) {
		const teamId = `filler-${i}`
		await seedTeam(teamId)
		await seedQualifyingRoster(teamId, MIN)
		await updateTeamRegistrationStatus(teamId, SEASON)
	}
}

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seasonRef().set({
		name: '2030 Winter',
		dateStart: Timestamp.now(),
		registeredTeamCount: 0,
	})
})

describe('claiming a registration spot', () => {
	it('registers a team that meets the threshold', async () => {
		await seedTeam('team-a')
		await seedQualifyingRoster('team-a', MIN)

		await updateTeamRegistrationStatus('team-a', SEASON)

		expect(await isRegistered('team-a')).toBe(true)
		expect(await spotsClaimed()).toBe(1)
	})

	it('does not register a team one player short', async () => {
		await seedTeam('team-a')
		await seedQualifyingRoster('team-a', MIN - 1)

		await updateTeamRegistrationStatus('team-a', SEASON)

		expect(await isRegistered('team-a')).toBe(false)
		expect(await spotsClaimed()).toBe(0)
	})

	it('claims exactly one spot however many times it is called', async () => {
		// The triggers that call this fire on every roster and player change,
		// so it runs many times for a team that is already in.
		await seedTeam('team-a')
		await seedQualifyingRoster('team-a', MIN)

		await updateTeamRegistrationStatus('team-a', SEASON)
		await updateTeamRegistrationStatus('team-a', SEASON)
		await updateTeamRegistrationStatus('team-a', SEASON)

		expect(await spotsClaimed()).toBe(1)
	})

	it('refuses the thirteenth team', async () => {
		// The whole point. Previously nothing consulted the cap when setting
		// the flag, so a thirteenth team registered and a trigger cleaned up
		// afterwards — which under team-level payment means money committed
		// for a spot that never existed.
		await fillSeason(CAP)
		await seedTeam('too-late')
		await seedQualifyingRoster('too-late', MIN)

		await updateTeamRegistrationStatus('too-late', SEASON)

		expect(await isRegistered('too-late')).toBe(false)
		expect(await spotsClaimed()).toBe(CAP)
	})

	it('gives the last spot to exactly one of two qualifying teams', async () => {
		await fillSeason(CAP - 1)
		await seedTeam('contender-a')
		await seedQualifyingRoster('contender-a', MIN)
		await seedTeam('contender-b')
		await seedQualifyingRoster('contender-b', MIN)

		await Promise.all([
			updateTeamRegistrationStatus('contender-a', SEASON),
			updateTeamRegistrationStatus('contender-b', SEASON),
		])

		const registered = [
			await isRegistered('contender-a'),
			await isRegistered('contender-b'),
		].filter(Boolean)

		expect(registered).toHaveLength(1)
		expect(await spotsClaimed()).toBe(CAP)
	})

	it('never lets the count exceed the cap under concurrency', async () => {
		// Five teams all qualifying at once against two remaining spots.
		// Firestore retries the losing transactions; the invariant is that the
		// counter and the number of registered teams both stop at the cap.
		await fillSeason(CAP - 2)
		const contenders = ['a', 'b', 'c', 'd', 'e'].map((x) => `contender-${x}`)
		for (const teamId of contenders) {
			await seedTeam(teamId)
			await seedQualifyingRoster(teamId, MIN)
		}

		await Promise.all(
			contenders.map((teamId) => updateTeamRegistrationStatus(teamId, SEASON))
		)

		const outcomes = await Promise.all(contenders.map(isRegistered))

		expect(outcomes.filter(Boolean)).toHaveLength(2)
		expect(await spotsClaimed()).toBe(CAP)
	})

	it('treats a missing counter as zero spots claimed', async () => {
		// Seasons created before the counter existed. The backfill in
		// scripts/migrations/2026-registered-team-count sets it, but the gate
		// must not fall over in the meantime.
		await seasonRef().set({ name: '2030 Winter', dateStart: Timestamp.now() })
		await seedTeam('team-a')
		await seedQualifyingRoster('team-a', MIN)

		await updateTeamRegistrationStatus('team-a', SEASON)

		expect(await isRegistered('team-a')).toBe(true)
		expect(await spotsClaimed()).toBe(1)
	})

	it('does nothing for a team with no season record', async () => {
		await expect(
			updateTeamRegistrationStatus('ghost', SEASON)
		).resolves.toBeUndefined()
		expect(await spotsClaimed()).toBe(0)
	})
})

describe('a claimed spot is never given back', () => {
	beforeEach(async () => {
		await seedTeam('team-a')
		await seedQualifyingRoster('team-a', MIN)
		await updateTeamRegistrationStatus('team-a', SEASON)
	})

	it('stays registered when the roster falls below the threshold', async () => {
		// The spot is gone from the season either way, and under team-level
		// payment there is money attached to it. Un-registering is an
		// administrative act that has to settle that money, not a side effect
		// of somebody leaving a roster.
		await playerSeasonRef(firestore, 'team-a-player-0', SEASON).update({
			signed: false,
		})

		await updateTeamRegistrationStatus('team-a', SEASON)

		expect(await isRegistered('team-a')).toBe(true)
	})

	it('does not release the spot back to the season', async () => {
		await playerSeasonRef(firestore, 'team-a-player-0', SEASON).update({
			paid: false,
		})

		await updateTeamRegistrationStatus('team-a', SEASON)

		expect(await spotsClaimed()).toBe(1)
	})

	it('keeps its original registeredDate', async () => {
		const before = (
			await teamSeasonRef(firestore, 'team-a', SEASON).get()
		).data()?.registeredDate

		await updateTeamRegistrationStatus('team-a', SEASON)

		expect(
			(await teamSeasonRef(firestore, 'team-a', SEASON).get()).data()
				?.registeredDate
		).toStrictEqual(before)
	})
})
