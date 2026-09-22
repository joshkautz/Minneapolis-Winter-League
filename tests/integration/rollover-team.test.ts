import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
} from './helpers.js'
import { rolloverTeam } from '../../Functions/src/index.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'

/**
 * Rolling a team over is how a returning captain keeps their team's identity
 * across seasons: the canonical team document stays, and a new season subdoc
 * is created carrying the name and logo forward. Under the 2026 data model
 * this is a subdocument creation, not a document clone, and the name it
 * carries comes from the team's *most recent* prior season rather than
 * whichever subdoc Firestore happens to return first.
 *
 * The authorization is unusual enough to be worth pinning: the caller must
 * have been a captain of this specific team in some prior season, which is
 * established by walking the team's season subdocs and checking the caller's
 * matching player-season on each.
 */

const CAPTAIN = 'captain-uid'
const TEAM = 'team-1'
const OLD_SEASON = 'season-2029'
const OLDER_SEASON = 'season-2028'
const NEW_SEASON = 'season-2030'

let firestore: Firestore

const rollover = async (
	uid = CAPTAIN,
	data: Record<string, unknown> = {}
): Promise<unknown> =>
	await rolloverTeam.run({
		auth: authed(uid),
		data: { originalTeamId: TEAM, seasonId: NEW_SEASON, ...data },
	} as unknown as CallableRequest<never>)

const fails = async (uid = CAPTAIN, data: Record<string, unknown> = {}) =>
	await errorCodeFrom(rolloverTeam, {
		auth: authed(uid),
		data: { originalTeamId: TEAM, seasonId: NEW_SEASON, ...data },
	})

const playerRef = (playerId: string) =>
	firestore.collection('players').doc(playerId)
const teamRef = (teamId: string) => firestore.collection('teams').doc(teamId)
const seasonRef = (seasonId: string) =>
	firestore.collection('seasons').doc(seasonId)

/** Seasons are ordered by dateStart; registration is open unless stated. */
const seedSeason = async (
	seasonId: string,
	startIso: string,
	options: { registrationEnded?: boolean } = {}
) => {
	const start = Timestamp.fromDate(new Date(startIso))
	await seasonRef(seasonId).set({
		name: seasonId,
		dateStart: start,
		dateEnd: start,
		registrationStart: Timestamp.fromMillis(0),
		registrationEnd: options.registrationEnded
			? Timestamp.fromMillis(1_000)
			: Timestamp.fromDate(new Date('2099-01-01')),
	})
}

const seedPlayer = async (
	playerId: string,
	options: { admin?: boolean } = {}
) => {
	await playerRef(playerId).set({
		admin: options.admin ?? false,
		email: `${playerId}@example.com`,
		firstname: playerId,
		lastname: 'Player',
	})
}

/** A team-season the player was on, optionally as captain. */
const seedPriorSeason = async (
	seasonId: string,
	options: {
		teamId?: string
		name: string
		logo?: string | null
		playerId?: string
		captain?: boolean
		banned?: boolean
	}
) => {
	const teamId = options.teamId ?? TEAM
	await teamRef(teamId).set({ createdAt: Timestamp.now(), createdBy: null })
	await teamSeasonRef(firestore, teamId, seasonId).set({
		season: seasonRef(seasonId),
		name: options.name,
		logo: options.logo ?? null,
		storagePath: options.logo ? `logos/${teamId}.png` : null,
		registered: true,
		registeredDate: null,
		placement: null,
	})
	const playerId = options.playerId ?? CAPTAIN
	await teamRosterEntryRef(firestore, teamId, seasonId, playerId).set({
		player: playerRef(playerId),
		dateJoined: Timestamp.now(),
	})
	await playerSeasonRef(firestore, playerId, seasonId).set({
		season: seasonRef(seasonId),
		team: teamRef(teamId),
		captain: options.captain ?? false,
		paid: true,
		signed: true,
		banned: options.banned ?? false,
	})
}

const readNewTeamSeason = async (teamId = TEAM) =>
	(await teamSeasonRef(firestore, teamId, NEW_SEASON).get()).data()
const readNewPlayerSeason = async (playerId = CAPTAIN) =>
	(await playerSeasonRef(firestore, playerId, NEW_SEASON).get()).data()

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seedSeason(OLDER_SEASON, '2028-01-01T00:00:00.000Z')
	await seedSeason(OLD_SEASON, '2029-01-01T00:00:00.000Z')
	await seedSeason(NEW_SEASON, '2030-01-01T00:00:00.000Z')
	await seedPlayer(CAPTAIN)
})

describe('rolloverTeam', () => {
	it('creates the season subdoc without touching the canonical team', async () => {
		await seedPriorSeason(OLD_SEASON, { name: 'Homemade Furby', captain: true })

		await rollover()
		const teamSeason = await readNewTeamSeason()

		expect(teamSeason?.name).toBe('Homemade Furby')
		expect(teamSeason?.season.path).toBe(`seasons/${NEW_SEASON}`)
		expect((await teamRef(TEAM).get()).exists).toBe(true)
	})

	it('starts the new season unregistered with no placement', async () => {
		await seedPriorSeason(OLD_SEASON, { name: 'Homemade Furby', captain: true })

		await rollover()
		const teamSeason = await readNewTeamSeason()

		expect(teamSeason?.registered).toBe(false)
		expect(teamSeason?.registeredDate).toBeNull()
		expect(teamSeason?.placement).toBeNull()
	})

	it('carries the logo forward', async () => {
		await seedPriorSeason(OLD_SEASON, {
			name: 'Homemade Furby',
			logo: 'https://example.com/logo.png',
			captain: true,
		})

		await rollover()
		const teamSeason = await readNewTeamSeason()

		expect(teamSeason?.logo).toBe('https://example.com/logo.png')
		expect(teamSeason?.storagePath).toBe(`logos/${TEAM}.png`)
	})

	it('takes the name from the most recent season, not the first found', async () => {
		// A team that renamed itself should roll over under the name it last
		// played as. Subcollection order is by document id, which here is the
		// season id — so seeding the older season with a later-sorting id is
		// what makes this test able to fail.
		await seedPriorSeason(OLDER_SEASON, {
			name: 'Original Name',
			captain: true,
		})
		await seedPriorSeason(OLD_SEASON, { name: 'Renamed Later', captain: true })

		await rollover()

		expect((await readNewTeamSeason())?.name).toBe('Renamed Later')
	})

	it('puts the captain on the new roster as captain', async () => {
		await seedPriorSeason(OLD_SEASON, { name: 'Homemade Furby', captain: true })

		await rollover()
		const roster = await teamSeasonRef(firestore, TEAM, NEW_SEASON)
			.collection('roster')
			.get()

		expect(roster.docs.map((d) => d.id)).toEqual([CAPTAIN])
		expect((await readNewPlayerSeason())?.captain).toBe(true)
		expect((await readNewPlayerSeason())?.team.path).toBe(`teams/${TEAM}`)
	})

	it('seeds a fresh season subdoc as unpaid and unsigned', async () => {
		// Rolling a team over is not registering for the season; the captain
		// still has to pay and sign.
		await seedPriorSeason(OLD_SEASON, { name: 'Homemade Furby', captain: true })

		await rollover()
		const season = await readNewPlayerSeason()

		expect(season?.paid).toBe(false)
		expect(season?.signed).toBe(false)
	})

	it('carries a ban forward from another season', async () => {
		// A ban has to survive the gap between seasons, or serving one is a
		// matter of waiting for the next registration to open.
		await seedPriorSeason(OLD_SEASON, {
			name: 'Homemade Furby',
			captain: true,
			banned: true,
		})

		// The ban is on OLD_SEASON, so the new season's guard does not see it
		// and the rollover proceeds — but the new subdoc inherits it.
		await rollover()

		expect((await readNewPlayerSeason())?.banned).toBe(true)
	})

	it('keeps paid state when the captain already registered for the season', async () => {
		await seedPriorSeason(OLD_SEASON, { name: 'Homemade Furby', captain: true })
		await playerSeasonRef(firestore, CAPTAIN, NEW_SEASON).set({
			season: seasonRef(NEW_SEASON),
			team: null,
			captain: false,
			paid: true,
			signed: true,
			banned: false,
		})

		await rollover()
		const season = await readNewPlayerSeason()

		expect(season?.paid).toBe(true)
		expect(season?.signed).toBe(true)
		expect(season?.captain).toBe(true)
	})

	it('cancels pending offers for the captain', async () => {
		// They have a team now; a live invitation would move them off it.
		await seedPriorSeason(OLD_SEASON, { name: 'Homemade Furby', captain: true })
		await teamRef('other-team').set({
			createdAt: Timestamp.now(),
			createdBy: null,
		})
		await firestore
			.collection('offers')
			.doc('offer-1')
			.set({
				player: playerRef(CAPTAIN),
				team: teamRef('other-team'),
				season: seasonRef(NEW_SEASON),
				status: 'pending',
				type: 'invitation',
				createdAt: Timestamp.now(),
			})

		await rollover()

		expect(
			(await firestore.collection('offers').doc('offer-1').get()).data()?.status
		).toBe('canceled')
	})

	it('refuses someone who was only a player on the team', async () => {
		await seedPriorSeason(OLD_SEASON, {
			name: 'Homemade Furby',
			captain: false,
		})

		expect(await fails()).toBe('permission-denied')
	})

	it('refuses a captain of a different team', async () => {
		// The player-season carries both `captain` and `team`, and only
		// checking the first would let any captain roll over any team.
		await seedPriorSeason(OLD_SEASON, {
			teamId: 'other-team',
			name: 'Other Team',
			captain: true,
		})
		await teamRef(TEAM).set({ createdAt: Timestamp.now(), createdBy: null })
		await teamSeasonRef(firestore, TEAM, OLD_SEASON).set({
			season: seasonRef(OLD_SEASON),
			name: 'Homemade Furby',
			logo: null,
			storagePath: null,
			registered: true,
			registeredDate: null,
			placement: null,
		})

		expect(await fails()).toBe('permission-denied')
	})

	it('refuses a captain who is already on a team this season', async () => {
		await seedPriorSeason(OLD_SEASON, { name: 'Homemade Furby', captain: true })
		await teamRef('other-team').set({
			createdAt: Timestamp.now(),
			createdBy: null,
		})
		await playerSeasonRef(firestore, CAPTAIN, NEW_SEASON).set({
			season: seasonRef(NEW_SEASON),
			team: teamRef('other-team'),
			captain: false,
			paid: false,
			signed: false,
			banned: false,
		})

		expect(await fails()).toBe('already-exists')
	})

	it('refuses a second rollover of the same team', async () => {
		await seedPriorSeason(OLD_SEASON, { name: 'Homemade Furby', captain: true })
		await rollover()

		expect(await fails()).toBe('already-exists')
	})

	it('refuses a captain banned for the new season', async () => {
		await seedPriorSeason(OLD_SEASON, { name: 'Homemade Furby', captain: true })
		await playerSeasonRef(firestore, CAPTAIN, NEW_SEASON).set({
			season: seasonRef(NEW_SEASON),
			team: null,
			captain: false,
			paid: false,
			signed: false,
			banned: true,
		})

		expect(await fails()).toBe('permission-denied')
	})

	it('refuses after registration has closed', async () => {
		await seedSeason(NEW_SEASON, '2030-01-01T00:00:00.000Z', {
			registrationEnded: true,
		})
		await seedPriorSeason(OLD_SEASON, { name: 'Homemade Furby', captain: true })

		expect(await fails()).toBe('failed-precondition')
	})

	it('lets an admin roll a team over after registration has closed', async () => {
		// Admins run the league by hand when something goes wrong mid-season.
		await seedSeason(NEW_SEASON, '2030-01-01T00:00:00.000Z', {
			registrationEnded: true,
		})
		await seedPriorSeason(OLD_SEASON, { name: 'Homemade Furby', captain: true })
		await playerRef(CAPTAIN).update({ admin: true })

		await rollover()

		expect((await readNewTeamSeason())?.name).toBe('Homemade Furby')
	})

	it('writes nothing when it refuses', async () => {
		await seedPriorSeason(OLD_SEASON, {
			name: 'Homemade Furby',
			captain: false,
		})

		await fails()

		expect(
			(await teamSeasonRef(firestore, TEAM, NEW_SEASON).get()).exists
		).toBe(false)
		expect(await readNewPlayerSeason()).toBeUndefined()
	})

	it.each([
		['season', { seasonId: 'no-such-season' }, 'not-found'],
		['team', { originalTeamId: 'no-such-team' }, 'not-found'],
	])('rejects an unknown %s', async (_label, data, expected) => {
		await seedPriorSeason(OLD_SEASON, { name: 'Homemade Furby', captain: true })

		expect(await fails(CAPTAIN, data)).toBe(expected)
	})

	it('rejects a missing team id', async () => {
		expect(await fails(CAPTAIN, { originalTeamId: '' })).toBe(
			'invalid-argument'
		)
	})

	it('rejects a caller with no player profile', async () => {
		await seedPriorSeason(OLD_SEASON, { name: 'Homemade Furby', captain: true })

		expect(await fails('stranger-uid')).toBe('not-found')
	})
})
