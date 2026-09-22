import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import { TEAM_CONFIG } from '../../Functions/src/config/constants.js'
import { teamSeasonRef } from '../../Functions/src/shared/database.js'

/**
 * onTeamRegistrationChange is the season lock: once
 * REGISTERED_TEAMS_FOR_LOCK teams are registered, every remaining
 * unregistered team-season for that season is deleted.
 *
 * It is the most destructive trigger in the codebase — it removes other
 * people's teams — and it fires unattended. The conditions under which it
 * does *not* fire matter as much as the one where it does.
 */

const LOCK = TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const SEASON = 'season-current'

const seasonRef = () => firestore.collection('seasons').doc(SEASON)

const snap = (data: Record<string, unknown>) => ({
	exists: true,
	data: () => data,
})

/** Fires the trigger for a team-season flipping registered state. */
const fire = (teamId: string, before: boolean, after: boolean) =>
	manifest.onTeamRegistrationChange.run({
		id: 'evt-1',
		params: { teamId, seasonId: SEASON },
		data: {
			before: snap({ season: seasonRef(), name: teamId, registered: before }),
			after: snap({ season: seasonRef(), name: teamId, registered: after }),
		},
	})

/** Creates `count` teams participating in the season with the given state. */
const seedTeams = async (
	prefix: string,
	count: number,
	registered: boolean
): Promise<string[]> => {
	const ids: string[] = []
	for (let i = 0; i < count; i++) {
		const teamId = `${prefix}-${i}`
		ids.push(teamId)
		await firestore.collection('teams').doc(teamId).set({ createdAt: Timestamp.now() })
		await teamSeasonRef(firestore, teamId, SEASON).set({
			season: seasonRef(),
			name: teamId,
			registered,
			registeredDate: registered ? Timestamp.now() : null,
		})
	}
	return ids
}

const teamSeasonExists = async (teamId: string): Promise<boolean> =>
	(await teamSeasonRef(firestore, teamId, SEASON).get()).exists

beforeAll(async () => {
	firestore = initTestApp()
	manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
})

beforeEach(async () => {
	await resetFirestore(firestore)
	// getCurrentSeason() picks the newest season by dateStart, so this must
	// be the latest or the trigger treats the event as a past season.
	await seasonRef().set({
		name: '2030 Winter',
		dateStart: Timestamp.fromDate(new Date('2030-01-01')),
	})
})

describe('onTeamRegistrationChange', () => {
	it(`deletes unregistered team-seasons once ${LOCK} teams are registered`, async () => {
		await seedTeams('reg', LOCK, true)
		const unregistered = await seedTeams('unreg', 3, false)

		await fire('reg-0', false, true)

		for (const teamId of unregistered) {
			expect(await teamSeasonExists(teamId)).toBe(false)
		}
		// Registered teams are untouched.
		expect(await teamSeasonExists('reg-0')).toBe(true)
	})

	it(`does nothing at ${LOCK - 1} registered teams`, async () => {
		await seedTeams('reg', LOCK - 1, true)
		const unregistered = await seedTeams('unreg', 2, false)

		await fire('reg-0', false, true)

		for (const teamId of unregistered) {
			expect(await teamSeasonExists(teamId)).toBe(true)
		}
	})

	it(`does nothing past ${LOCK}, so a later change cannot re-run the lock`, async () => {
		// The check is an equality, not a threshold: once the lock has run,
		// a thirteenth registration must not delete anything again.
		await seedTeams('reg', LOCK + 1, true)
		const unregistered = await seedTeams('unreg', 2, false)

		await fire('reg-0', false, true)

		for (const teamId of unregistered) {
			expect(await teamSeasonExists(teamId)).toBe(true)
		}
	})

	it.each([
		['true', 'true', true, true],
		['false', 'false', false, false],
		['true', 'false', true, false],
	])(
		'ignores a registered %s to %s transition',
		async (_b, _a, before, after) => {
			await seedTeams('reg', LOCK, true)
			const unregistered = await seedTeams('unreg', 2, false)

			await fire('reg-0', before, after)

			for (const teamId of unregistered) {
				expect(await teamSeasonExists(teamId)).toBe(true)
			}
		}
	)

	it('does nothing for a season that is not the current one', async () => {
		// A late registration on a past season must not delete teams there.
		await firestore.collection('seasons').doc('season-newer').set({
			name: '2031 Winter',
			dateStart: Timestamp.fromDate(new Date('2031-01-01')),
		})
		await seedTeams('reg', LOCK, true)
		const unregistered = await seedTeams('unreg', 2, false)

		await fire('reg-0', false, true)

		for (const teamId of unregistered) {
			expect(await teamSeasonExists(teamId)).toBe(true)
		}
	})

	it('early-returns while a migration is in progress', async () => {
		await firestore.doc('system/maintenance').set({ migrationInProgress: true })
		await seedTeams('reg', LOCK, true)
		const unregistered = await seedTeams('unreg', 2, false)

		await fire('reg-0', false, true)

		for (const teamId of unregistered) {
			expect(await teamSeasonExists(teamId)).toBe(true)
		}
	})

	it('is a no-op when there are no unregistered teams to remove', async () => {
		await seedTeams('reg', LOCK, true)
		await expect(fire('reg-0', false, true)).resolves.toBeUndefined()
		expect(await teamSeasonExists('reg-0')).toBe(true)
	})
})
