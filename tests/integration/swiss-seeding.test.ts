import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	type Callable,
} from './helpers.js'
import { REGISTRATION_SPOTS } from '../../Functions/src/shared/teamPaymentRules.js'

/**
 * setSwissSeeding: an admin orders a Swiss season's teams, and each
 * team-season gets its seed. The list is bounded, so its one batch is too.
 */

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const SEASON = 'season-swiss'
const ADMIN = 'admin-1'
const TEAMS = ['team-a', 'team-b', 'team-c']

const teamSeason = (teamId: string) =>
	firestore
		.collection('teams')
		.doc(teamId)
		.collection('teamSeasons')
		.doc(SEASON)

const seed = (teamSeeding: string[]) =>
	(manifest.setSwissSeeding as Callable).run({
		auth: authed(ADMIN),
		data: { seasonId: SEASON, teamSeeding },
	} as unknown as CallableRequest<never>)

const refusal = (teamSeeding: string[]) =>
	errorCodeFrom(manifest.setSwissSeeding, {
		auth: authed(ADMIN),
		data: { seasonId: SEASON, teamSeeding },
	})

beforeAll(async () => {
	firestore = initTestApp()
	manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await firestore.collection('players').doc(ADMIN).set({ admin: true })
	const seasonRef = firestore.collection('seasons').doc(SEASON)
	await seasonRef.set({
		name: 'Season 6',
		format: 'swiss',
		dateStart: Timestamp.fromDate(new Date('2027-02-13T06:00:00Z')),
		dateEnd: Timestamp.fromDate(new Date('2027-04-04T05:00:00Z')),
	})
	for (const teamId of TEAMS) {
		await teamSeason(teamId).set({ season: seasonRef, name: teamId })
	}
})

describe('setSwissSeeding', () => {
	it('gives each team its place in the list as its seed', async () => {
		await seed(['team-c', 'team-a', 'team-b'])

		const seeds = await Promise.all(
			TEAMS.map(async (id) => (await teamSeason(id).get()).data()?.swissSeed)
		)
		expect(seeds).toEqual([2, 3, 1])
	})

	it('writes nothing when a team is not in the season', async () => {
		expect(await refusal(['team-a', 'team-elsewhere'])).toBe('invalid-argument')
		expect((await teamSeason('team-a').get()).data()?.swissSeed).toBeUndefined()
	})

	it('refuses more teams than there are registration spots', async () => {
		// Every team takes part, so the size is the only thing wrong.
		const tooMany = Array.from(
			{ length: REGISTRATION_SPOTS + 1 },
			(_, i) => `team-${i}`
		)
		const seasonRef = firestore.collection('seasons').doc(SEASON)
		for (const teamId of tooMany) {
			await teamSeason(teamId).set({ season: seasonRef, name: teamId })
		}
		expect(await refusal(tooMany)).toBe('invalid-argument')
		expect((await teamSeason('team-0').get()).data()?.swissSeed).toBeUndefined()
	})

	it('refuses a list naming a team twice', async () => {
		expect(await refusal(['team-a', 'team-a'])).toBe('invalid-argument')
	})

	it('refuses a season that is not Swiss', async () => {
		await firestore.collection('seasons').doc(SEASON).update({ format: null })
		expect(await refusal(TEAMS)).toBe('failed-precondition')
	})
})
