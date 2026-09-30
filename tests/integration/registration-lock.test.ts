import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import { TEAM_CONFIG } from '../../Functions/src/config/constants.js'
import { onTeamRegistrationChange } from '../../Functions/src/index.js'
import { teamSeasonRef } from '../../Functions/src/shared/database.js'

/**
 * The twelve-team cap.
 *
 * `onTeamRegistrationChange` fires when a team's `registered` flag flips to
 * true, counts how many teams are registered for the season, and — at the
 * threshold — deletes every team that has not registered, closing the
 * season.
 *
 * It has always been a cleanup pass rather than a gate, which was tolerable
 * while registration cost ten separate $100 payments and teams trickled in.
 * Under team-level payment it becomes a race for twelve spots with real money
 * committed, so these tests establish exactly what it does and does not
 * guarantee. See docs/TEAM_PAYMENTS.md.
 */

const THRESHOLD = TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK
const SEASON = 'season-1'

let firestore: Firestore

const seasonRef = () => firestore.collection('seasons').doc(SEASON)

const seedTeam = async (teamId: string, registered: boolean) => {
	await firestore
		.collection('teams')
		.doc(teamId)
		.set({ createdAt: Timestamp.now(), createdBy: null })
	await teamSeasonRef(firestore, teamId, SEASON).set({
		season: seasonRef(),
		name: teamId,
		logo: null,
		storagePath: null,
		registered,
		registeredDate: registered ? Timestamp.now() : null,
		placement: null,
	})
	// A team registers by claiming a spot on the season, as
	// claimSpotIfQualified does; the lock reads that count.
	if (registered) {
		await seasonRef().update({ registeredTeamCount: FieldValue.increment(1) })
	}
}

/** Fires the trigger for a team whose flag just flipped false -> true. */
const fireRegistered = async (teamId: string) =>
	await onTeamRegistrationChange.run({
		params: { teamId, seasonId: SEASON },
		data: {
			before: { exists: true, data: () => ({ registered: false }) },
			after: { exists: true, data: () => ({ registered: true }) },
		},
	} as never)

const registeredCount = async () =>
	(
		await firestore
			.collectionGroup('teamSeasons')
			.where('season', '==', seasonRef())
			.where('registered', '==', true)
			.get()
	).size

/**
 * Team ids still participating in this season. The lock deletes the
 * team-season subdoc, not the canonical team document — a team persists
 * across seasons, so its absence from *this* season is what closing
 * registration means.
 */
const teamsInSeason = async () =>
	(
		await firestore
			.collectionGroup('teamSeasons')
			.where('season', '==', seasonRef())
			.get()
	).docs
		.map((d) => d.ref.parent.parent?.id ?? '?')
		.sort()

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seasonRef().set({
		name: '2030 Winter',
		dateStart: Timestamp.now(),
	})
})

describe('the twelve-team lock', () => {
	it('closes the season once the threshold is reached', async () => {
		for (let i = 0; i < THRESHOLD; i++) {
			await seedTeam(`registered-${i}`, true)
		}
		await seedTeam('hopeful', false)

		await fireRegistered(`registered-${THRESHOLD - 1}`)

		// The team that never registered is deleted outright.
		expect(await teamsInSeason()).not.toContain('hopeful')
		expect(await registeredCount()).toBe(THRESHOLD)
	})

	it('does nothing while the season is under the threshold', async () => {
		for (let i = 0; i < THRESHOLD - 1; i++) {
			await seedTeam(`registered-${i}`, true)
		}
		await seedTeam('hopeful', false)

		await fireRegistered(`registered-${THRESHOLD - 2}`)

		expect(await teamsInSeason()).toContain('hopeful')
	})

	it('still locks if the count overshoots the threshold', async () => {
		// The guard was once `count !== THRESHOLD`: two teams completing
		// close together both saw 13, neither locked, and registration
		// silently stayed open. It is now `>=`.
		for (let i = 0; i < THRESHOLD + 1; i++) {
			await seedTeam(`registered-${i}`, true)
		}
		await seedTeam('hopeful', false)

		await fireRegistered(`registered-${THRESHOLD}`)

		expect(await teamsInSeason()).not.toContain('hopeful')
	})

	it('closes the season when both of two simultaneous teams overshoot', async () => {
		// The same race from both sides: teams 12 and 13 flip registered at
		// almost the same moment, so both triggers observe 13.
		for (let i = 0; i < THRESHOLD - 1; i++) {
			await seedTeam(`registered-${i}`, true)
		}
		await seedTeam('twelfth', true)
		await seedTeam('thirteenth', true)
		await seedTeam('hopeful', false)

		await fireRegistered('twelfth')
		await fireRegistered('thirteenth')

		expect(await registeredCount()).toBe(THRESHOLD + 1)
		expect(await teamsInSeason()).not.toContain('hopeful')
	})

	it('ignores a flag that was already true', async () => {
		for (let i = 0; i < THRESHOLD; i++) {
			await seedTeam(`registered-${i}`, true)
		}
		await seedTeam('hopeful', false)

		await onTeamRegistrationChange.run({
			params: { teamId: 'registered-0', seasonId: SEASON },
			data: {
				before: { exists: true, data: () => ({ registered: true }) },
				after: { exists: true, data: () => ({ registered: true }) },
			},
		} as never)

		expect(await teamsInSeason()).toContain('hopeful')
	})

	it('does not run while a migration is in progress', async () => {
		await firestore
			.collection('system')
			.doc('maintenance')
			.set({ migrationInProgress: true })
		for (let i = 0; i < THRESHOLD; i++) {
			await seedTeam(`registered-${i}`, true)
		}
		await seedTeam('hopeful', false)

		await fireRegistered(`registered-${THRESHOLD - 1}`)

		expect(await teamsInSeason()).toContain('hopeful')
	})
})
