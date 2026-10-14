import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { CallableRequest } from 'firebase-functions/v2/https'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	type Callable,
} from './helpers.js'

/**
 * Emergency contacts by team, for game day. The contacts are on signature
 * records private to the player and admins, so the callable is the only
 * way to see them a team at a time; what matters is that it lists exactly
 * the season's registered rosters, each player with the contacts from
 * that season's waiver, and says plainly who has none.
 */

const SEASON = 'season-5'
const OLD_SEASON = 'season-4'
const ADMIN = 'admin-1'

let firestore: Firestore
let getEmergencyContacts: Callable

const seasonRef = (id = SEASON) => firestore.collection('seasons').doc(id)

const call = (data: unknown) =>
	getEmergencyContacts.run({
		auth: authed(ADMIN),
		data,
	} as unknown as CallableRequest<never>)

const seedTeam = async (
	teamId: string,
	name: string,
	registered: boolean,
	roster: { playerId: string; captain?: boolean }[]
) => {
	const teamSeason = firestore
		.collection('teams')
		.doc(teamId)
		.collection('teamSeasons')
		.doc(SEASON)
	await firestore.collection('teams').doc(teamId).set({ createdBy: null })
	await teamSeason.set({
		season: seasonRef(),
		name,
		logo: null,
		storagePath: null,
		registered,
		registeredDate: null,
		placement: null,
	})
	for (const { playerId, captain = false } of roster) {
		const player = firestore.collection('players').doc(playerId)
		await teamSeason
			.collection('roster')
			.doc(playerId)
			.set({ player, dateJoined: Timestamp.now() })
		await player
			.collection('playerSeasons')
			.doc(SEASON)
			.set({
				season: seasonRef(),
				team: firestore.collection('teams').doc(teamId),
				captain,
				paid: true,
				signed: true,
			})
	}
}

const seedPlayer = (id: string, firstname: string, lastname: string) =>
	firestore
		.collection('players')
		.doc(id)
		.set({ admin: false, banned: false, firstname, lastname })

const contact = (name: string) => ({
	name,
	relationship: 'Partner',
	phone: '(612) 555-0100',
})

const seedSignature = (
	playerId: string,
	overrides: Record<string, unknown> = {}
) =>
	firestore
		.collection('players')
		.doc(playerId)
		.collection('waiverSignatures')
		.add({
			seasonId: SEASON,
			versionId: '2026-09-original',
			versionSha256: 'sha',
			method: 'player',
			recordedBy: playerId,
			signedAt: Timestamp.fromDate(new Date('2026-10-05T00:00:00Z')),
			participantName: playerId,
			signerName: playerId,
			signerRole: 'participant',
			guardianRelationship: null,
			dateOfBirth: '1990-01-01',
			mailingAddress: '1 Main St',
			emergencyContacts: [],
			email: null,
			ipAddress: null,
			userAgent: null,
			note: null,
			...overrides,
		})

beforeAll(async () => {
	firestore = initTestApp()
	const manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
	getEmergencyContacts = manifest.getEmergencyContacts as Callable
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await firestore.collection('players').doc(ADMIN).set({ admin: true })
	for (const id of [SEASON, OLD_SEASON]) {
		await seasonRef(id).set({
			name: id === SEASON ? 'Season 5' : 'Season 4',
			dateStart: Timestamp.fromDate(new Date('2026-11-07T06:00:00Z')),
			dateEnd: Timestamp.fromDate(new Date('2026-12-20T06:00:00Z')),
			registrationStart: Timestamp.fromDate(new Date('2026-10-01T05:00:00Z')),
			registrationEnd: Timestamp.fromDate(new Date('2026-10-31T04:59:00Z')),
		})
	}
	await seedPlayer('signed', 'Sam', 'Signed')
	await seedPlayer('paper', 'Pat', 'Paper')
	await seedPlayer('unsigned', 'Una', 'Unsigned')
	await seedPlayer('captain', 'Cam', 'Zed')
	await seedPlayer('other', 'Oli', 'Other')
	await seedTeam('team-b', 'Snow Owls', true, [
		{ playerId: 'signed' },
		{ playerId: 'paper' },
		{ playerId: 'unsigned' },
		{ playerId: 'captain', captain: true },
	])
	await seedTeam('team-a', 'Frost Giants', true, [{ playerId: 'other' }])
	await seedTeam('team-c', 'Not In', false, [])
})

describe('getEmergencyContacts', () => {
	it('lists each registered team, by name, captains first', async () => {
		const result = (await call({ seasonId: SEASON })) as {
			seasonName: string
			teams: { teamId: string; teamName: string; players: { name: string }[] }[]
		}

		expect(result.seasonName).toBe('Season 5')
		expect(result.teams.map((team) => team.teamName)).toEqual([
			'Frost Giants',
			'Snow Owls',
		])
		expect(result.teams[1].teamId).toBe('team-b')
		expect(result.teams[1].players.map((player) => player.name)).toEqual([
			'Cam Zed',
			'Pat Paper',
			'Sam Signed',
			'Una Unsigned',
		])
	})

	it('gives each player the contacts from this season’s own signature', async () => {
		await seedSignature('signed', {
			emergencyContacts: [contact('Alex Signed'), contact('Jo Signed')],
		})
		// An admin's record of a paper waiver holds no contacts.
		await seedSignature('paper', {
			method: 'admin',
			recordedBy: ADMIN,
			signerName: null,
			signerRole: null,
			dateOfBirth: null,
			mailingAddress: null,
		})
		// Last season's contacts are not this season's.
		await seedSignature('unsigned', {
			seasonId: OLD_SEASON,
			emergencyContacts: [contact('Stale Contact')],
		})
		// Signed in the app, then later re-marked signed by an admin: the
		// newer admin record holds no contacts, the player's own does.
		await seedSignature('captain', {
			emergencyContacts: [contact('Cam’s Parent')],
		})
		await seedSignature('captain', {
			method: 'admin',
			recordedBy: ADMIN,
			emergencyContacts: [],
			signedAt: Timestamp.fromDate(new Date('2026-10-10T00:00:00Z')),
		})

		const result = (await call({ seasonId: SEASON })) as {
			teams: {
				players: {
					playerId: string
					captain: boolean
					status: string
					contacts: { name: string }[]
				}[]
			}[]
		}
		const byId = Object.fromEntries(
			result.teams[1].players.map((player) => [player.playerId, player])
		)

		expect(byId.signed).toMatchObject({
			status: 'contacts',
			captain: false,
			contacts: [
				{
					name: 'Alex Signed',
					relationship: 'Partner',
					phone: '(612) 555-0100',
				},
				{ name: 'Jo Signed', relationship: 'Partner', phone: '(612) 555-0100' },
			],
		})
		expect(byId.paper).toMatchObject({ status: 'recorded', contacts: [] })
		expect(byId.unsigned).toMatchObject({ status: 'unsigned', contacts: [] })
		expect(byId.captain).toMatchObject({
			status: 'contacts',
			captain: true,
			contacts: [{ name: 'Cam’s Parent' }],
		})
	})

	it('returns only the contacts, never the rest of the signature', async () => {
		await seedSignature('signed', {
			emergencyContacts: [contact('Alex Signed')],
		})

		const text = JSON.stringify(await call({ seasonId: SEASON }))

		expect(text).not.toContain('1 Main St')
		expect(text).not.toContain('1990-01-01')
	})

	it('names a rostered player whose account is gone', async () => {
		await firestore.collection('players').doc('other').delete()

		const result = (await call({ seasonId: SEASON })) as {
			teams: { players: { name: string; status: string }[] }[]
		}

		expect(result.teams[0].players).toMatchObject([
			{ name: 'Deleted account', status: 'unsigned' },
		])
	})

	it('refuses a season that does not exist, or none at all', async () => {
		expect(
			await errorCodeFrom(getEmergencyContacts, {
				auth: authed(ADMIN),
				data: { seasonId: 'season-9' },
			})
		).toBe('not-found')
		expect(
			await errorCodeFrom(getEmergencyContacts, {
				auth: authed(ADMIN),
				data: {},
			})
		).toBe('invalid-argument')
	})

	it('refuses a player who is not an admin', async () => {
		await seedPlayer('player-1', 'Pia', 'Player')

		expect(
			await errorCodeFrom(getEmergencyContacts, {
				auth: authed('player-1'),
				data: { seasonId: SEASON },
			})
		).toBe('permission-denied')
	})
})
