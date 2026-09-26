import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	seedAuthUser,
} from './helpers.js'
import { updateTeamAdmin } from '../../Functions/src/index.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'

/**
 * The admin team editor: renames, roster additions and removals, and captain
 * changes, applied as one transaction.
 *
 * It used to commit each change on its own, so a request refused halfway
 * through had already applied everything before the refusal — the admin saw
 * an error and a half-edited team.
 */

const ADMIN = 'admin-1'
const TEAM = 'team-1'
const OTHER_TEAM = 'team-2'
const SEASON = 'season-1'
const CAPTAIN = 'captain-1'
const MEMBER = 'member-1'
const FREE_AGENT = 'free-agent-1'

let firestore: Firestore

const player = (id: string) => firestore.collection('players').doc(id)
const season = () => firestore.collection('seasons').doc(SEASON)

const seedPlayer = async (id: string, admin = false): Promise<void> => {
	await seedAuthUser(id, true)
	await player(id).set({ admin, firstname: id, lastname: 'Player' })
}

const seedTeam = async (teamId: string, name: string): Promise<void> => {
	await firestore
		.collection('teams')
		.doc(teamId)
		.set({ createdAt: Timestamp.now(), createdBy: null })
	await teamSeasonRef(firestore, teamId, SEASON).set({
		season: season(),
		name,
		logo: null,
		storagePath: null,
		registered: false,
		registeredDate: null,
		placement: null,
	})
}

const putOnTeam = async (
	playerId: string,
	teamId: string,
	captain: boolean
): Promise<void> => {
	await teamRosterEntryRef(firestore, teamId, SEASON, playerId).set({
		player: player(playerId),
		dateJoined: Timestamp.now(),
	})
	await playerSeasonRef(firestore, playerId, SEASON).set({
		season: season(),
		team: firestore.collection('teams').doc(teamId),
		captain,
		paid: false,
		signed: false,
	})
}

const edit = (data: Record<string, unknown>): Promise<string | null> =>
	errorCodeFrom(updateTeamAdmin, {
		auth: authed(ADMIN),
		data: { teamId: TEAM, seasonId: SEASON, ...data },
	})

const onRoster = async (playerId: string): Promise<boolean> =>
	(await teamRosterEntryRef(firestore, TEAM, SEASON, playerId).get()).exists

const playerSeason = async (playerId: string) =>
	(await playerSeasonRef(firestore, playerId, SEASON).get()).data()

const teamName = async (): Promise<string | undefined> =>
	(await teamSeasonRef(firestore, TEAM, SEASON).get()).data()?.name

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await season().set({ name: '2030 Winter' })
	await seedPlayer(ADMIN, true)
	for (const id of [CAPTAIN, MEMBER, FREE_AGENT]) await seedPlayer(id)
	await seedTeam(TEAM, 'Marlins')
	await putOnTeam(CAPTAIN, TEAM, true)
	await putOnTeam(MEMBER, TEAM, false)
})

describe('updateTeamAdmin', () => {
	it('adds a player to both sides of the membership', async () => {
		expect(
			await edit({
				rosterChanges: {
					addPlayers: [{ playerId: FREE_AGENT, captain: true }],
				},
			})
		).toBeNull()

		expect(await onRoster(FREE_AGENT)).toBe(true)
		const added = await playerSeason(FREE_AGENT)
		expect(added?.team?.id).toBe(TEAM)
		expect(added?.captain).toBe(true)
	})

	it('refuses a player already on another team this season', async () => {
		await seedTeam(OTHER_TEAM, 'Otters')
		await putOnTeam(FREE_AGENT, OTHER_TEAM, false)

		expect(
			await edit({
				rosterChanges: {
					addPlayers: [{ playerId: FREE_AGENT, captain: false }],
				},
			})
		).toBe('failed-precondition')
		expect(await onRoster(FREE_AGENT)).toBe(false)
		expect((await playerSeason(FREE_AGENT))?.team?.id).toBe(OTHER_TEAM)
	})

	it('refuses a player already on this team', async () => {
		expect(
			await edit({
				rosterChanges: { addPlayers: [{ playerId: MEMBER, captain: false }] },
			})
		).toBe('already-exists')
	})

	it('refuses a player who does not exist', async () => {
		expect(
			await edit({
				rosterChanges: { addPlayers: [{ playerId: 'nobody', captain: false }] },
			})
		).toBe('not-found')
	})

	it('removes a player from both sides of the membership', async () => {
		expect(
			await edit({ rosterChanges: { removePlayers: [MEMBER] } })
		).toBeNull()

		expect(await onRoster(MEMBER)).toBe(false)
		expect((await playerSeason(MEMBER))?.team).toBeNull()
	})

	it('refuses to remove the only captain', async () => {
		expect(await edit({ rosterChanges: { removePlayers: [CAPTAIN] } })).toBe(
			'failed-precondition'
		)
		expect(await onRoster(CAPTAIN)).toBe(true)
	})

	it('refuses to demote the only captain', async () => {
		expect(
			await edit({
				rosterChanges: {
					updateCaptainStatus: [{ playerId: CAPTAIN, captain: false }],
				},
			})
		).toBe('failed-precondition')
		expect((await playerSeason(CAPTAIN))?.captain).toBe(true)
	})

	it('lets the captain go when the same request names another', async () => {
		// Judged on the roster as the whole request leaves it.
		expect(
			await edit({
				rosterChanges: {
					updateCaptainStatus: [
						{ playerId: MEMBER, captain: true },
						{ playerId: CAPTAIN, captain: false },
					],
				},
			})
		).toBeNull()

		expect((await playerSeason(MEMBER))?.captain).toBe(true)
		expect((await playerSeason(CAPTAIN))?.captain).toBe(false)
	})

	it('applies nothing when any part of the request is refused', async () => {
		const code = await edit({
			name: 'Renamed',
			rosterChanges: {
				addPlayers: [{ playerId: FREE_AGENT, captain: false }],
				removePlayers: [CAPTAIN],
			},
		})

		expect(code).toBe('failed-precondition')
		expect(await teamName()).toBe('Marlins')
		expect(await onRoster(FREE_AGENT)).toBe(false)
		expect(await playerSeason(FREE_AGENT)).toBeUndefined()
	})

	it('renames the team', async () => {
		expect(await edit({ name: '  Mounds View Marlins ' })).toBeNull()
		expect(await teamName()).toBe('Mounds View Marlins')
	})

	it('refuses a team that has no season here', async () => {
		expect(await edit({ teamId: 'no-such-team', name: 'Renamed' })).toBe(
			'not-found'
		)
	})
})
