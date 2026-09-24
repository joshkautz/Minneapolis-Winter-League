import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
	authed,
	type Callable,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	seedAuthUser,
} from './helpers.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
} from '../../Functions/src/shared/database.js'

/**
 * Behavioural tests for the callables carrying the most business rules.
 *
 * The authorization sweep proves every callable rejects the wrong caller.
 * These cover what it happens to the *right* caller: registration windows,
 * bans, one-team-per-season, and the roster rules that decide whether a team
 * can lose its last captain.
 */

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const fn = (name: string): Callable => manifest[name] as Callable

const SEASON = 'season-1'
const PLAYER = 'player-1'

const daysFromNow = (days: number): Timestamp =>
	Timestamp.fromDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000))

/** Seeds a season whose registration window is currently open. */
const seedSeason = async (
	overrides: Record<string, unknown> = {}
): Promise<void> => {
	await firestore
		.collection('seasons')
		.doc(SEASON)
		.set({
			name: '2030 Winter',
			dateStart: daysFromNow(30),
			dateEnd: daysFromNow(90),
			registrationStart: daysFromNow(-10),
			registrationEnd: daysFromNow(10),
			teams: [],
			...overrides,
		})
}

const seedPlayer = async (
	uid: string,
	opts: { admin?: boolean } = {}
): Promise<void> => {
	await seedAuthUser(uid, true)
	await firestore
		.collection('players')
		.doc(uid)
		.set({
			admin: opts.admin ?? false,
			email: `${uid}@example.com`,
			firstname: 'Test',
			lastname: 'Player',
		})
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
	await seedSeason()
	await seedPlayer(PLAYER)
})

describe('createTeam', () => {
	it('creates the team and puts the creator on it as captain', async () => {
		const code = await errorCodeFrom(fn('createTeam'), {
			auth: authed(PLAYER),
			data: { name: 'Test Team', seasonId: SEASON },
		})
		expect(code).toBeNull()

		// The creator's season subdoc must point at the new team, and the
		// team's roster must contain them — both sides, or the UI breaks.
		const playerSeason = (
			await playerSeasonRef(firestore, PLAYER, SEASON).get()
		).data()
		expect(playerSeason?.team).toBeTruthy()
		expect(playerSeason?.captain).toBe(true)

		const teamId = playerSeason!.team!.id
		const roster = await teamRosterEntryRef(
			firestore,
			teamId,
			SEASON,
			PLAYER
		).get()
		expect(roster.exists).toBe(true)
	})

	it('rejects a season that does not exist', async () => {
		const code = await errorCodeFrom(fn('createTeam'), {
			auth: authed(PLAYER),
			data: { name: 'Test Team', seasonId: 'no-such-season' },
		})
		expect(code).toBe('not-found')
	})

	it('rejects a caller with no player profile', async () => {
		await seedAuthUser('profileless', true)
		const code = await errorCodeFrom(fn('createTeam'), {
			auth: authed('profileless'),
			data: { name: 'Test Team', seasonId: SEASON },
		})
		expect(code).toBe('not-found')
	})

	it('refuses once registration has closed', async () => {
		await seedSeason({ registrationEnd: daysFromNow(-1) })
		const code = await errorCodeFrom(fn('createTeam'), {
			auth: authed(PLAYER),
			data: { name: 'Test Team', seasonId: SEASON },
		})
		expect(code).toBe('failed-precondition')
	})

	it('lets an admin create a team after registration has closed', async () => {
		// Admins deliberately bypass the registration window.
		await seedSeason({ registrationEnd: daysFromNow(-1) })
		await seedPlayer('admin-1', { admin: true })

		const code = await errorCodeFrom(fn('createTeam'), {
			auth: authed('admin-1'),
			data: { name: 'Admin Team', seasonId: SEASON },
		})
		expect(code).toBeNull()
	})

	it('refuses a banned player', async () => {
		// A ban is account-level, so it is set on the player document and
		// applies whether or not they have a subdoc for this season.
		await firestore.collection('players').doc(PLAYER).update({ banned: true })

		const code = await errorCodeFrom(fn('createTeam'), {
			auth: authed(PLAYER),
			data: { name: 'Test Team', seasonId: SEASON },
		})
		expect(code).toBe('permission-denied')
	})

	it('refuses a player who is already on a team this season', async () => {
		await errorCodeFrom(fn('createTeam'), {
			auth: authed(PLAYER),
			data: { name: 'First Team', seasonId: SEASON },
		})

		const code = await errorCodeFrom(fn('createTeam'), {
			auth: authed(PLAYER),
			data: { name: 'Second Team', seasonId: SEASON },
		})
		expect(code).toBe('already-exists')
	})

	it('requires a name and a season', async () => {
		expect(
			await errorCodeFrom(fn('createTeam'), {
				auth: authed(PLAYER),
				data: { seasonId: SEASON },
			})
		).toBe('invalid-argument')
		expect(
			await errorCodeFrom(fn('createTeam'), {
				auth: authed(PLAYER),
				data: { name: 'Test Team' },
			})
		).toBe('invalid-argument')
	})

	it('rejects a logo that is not an image', async () => {
		const code = await errorCodeFrom(fn('createTeam'), {
			auth: authed(PLAYER),
			data: {
				name: 'Test Team',
				seasonId: SEASON,
				logoBlob: 'ZmFrZQ==',
				logoContentType: 'application/pdf',
			},
		})
		expect(code).toBe('invalid-argument')
	})

	it('requires a content type alongside a logo blob', async () => {
		const code = await errorCodeFrom(fn('createTeam'), {
			auth: authed(PLAYER),
			data: { name: 'Test Team', seasonId: SEASON, logoBlob: 'ZmFrZQ==' },
		})
		expect(code).toBe('invalid-argument')
	})
})

describe('updateTeamRoster', () => {
	let teamId: string

	beforeEach(async () => {
		await errorCodeFrom(fn('createTeam'), {
			auth: authed(PLAYER),
			data: { name: 'Captain Team', seasonId: SEASON },
		})
		const playerSeason = (
			await playerSeasonRef(firestore, PLAYER, SEASON).get()
		).data()
		teamId = playerSeason!.team!.id
	})

	it('refuses to remove the only captain', async () => {
		// Leaving a team captainless strands it: nobody could manage the
		// roster afterwards.
		const code = await errorCodeFrom(fn('updateTeamRoster'), {
			auth: authed(PLAYER),
			data: { teamId, playerId: PLAYER, action: 'demote' },
		})
		expect(code).toBe('failed-precondition')
	})

	it('refuses a caller who is not on the team', async () => {
		await seedPlayer('outsider')
		const code = await errorCodeFrom(fn('updateTeamRoster'), {
			auth: authed('outsider'),
			data: { teamId, playerId: PLAYER, action: 'remove' },
		})
		expect(code).toBe('permission-denied')
	})

	it('rejects an unknown action', async () => {
		const code = await errorCodeFrom(fn('updateTeamRoster'), {
			auth: authed(PLAYER),
			data: { teamId, playerId: PLAYER, action: 'make-admin' },
		})
		expect(code).toBe('invalid-argument')
	})

	it('rejects a team that does not exist', async () => {
		const code = await errorCodeFrom(fn('updateTeamRoster'), {
			auth: authed(PLAYER),
			data: { teamId: 'no-such-team', playerId: PLAYER, action: 'remove' },
		})
		expect(code).toBe('not-found')
	})
})

describe('updateTeamRoster on a registered team', () => {
	/**
	 * A registered team cannot drop below ten qualifying players. Under
	 * team-total pricing nobody pays individually, and this check counted
	 * only paid-and-signed players — so it counted zero, and nobody on a
	 * registered 2026 Fall team could leave or be removed.
	 */
	const TEAM = 'registered-team'

	/** A registered team: PLAYER captains it, `members` more have signed. */
	const seedRegisteredTeam = async (
		members: number,
		opts: { paid: boolean }
	): Promise<string[]> => {
		await firestore
			.collection('teams')
			.doc(TEAM)
			.set({ createdAt: Timestamp.now(), createdBy: null })
		await firestore
			.collection('teams')
			.doc(TEAM)
			.collection('teamSeasons')
			.doc(SEASON)
			.set({
				season: firestore.collection('seasons').doc(SEASON),
				name: 'Registered Team',
				registered: true,
				registeredDate: Timestamp.now(),
			})
		const playerIds = [
			PLAYER,
			...Array.from({ length: members }, (_, i) => `member-${i}`),
		]
		for (const playerId of playerIds) {
			if (playerId !== PLAYER) await seedPlayer(playerId)
			await teamRosterEntryRef(firestore, TEAM, SEASON, playerId).set({
				player: firestore.collection('players').doc(playerId),
				dateJoined: Timestamp.now(),
			})
			await playerSeasonRef(firestore, playerId, SEASON).set({
				season: firestore.collection('seasons').doc(SEASON),
				team: firestore.collection('teams').doc(TEAM),
				captain: playerId === PLAYER,
				paid: opts.paid,
				signed: true,
			})
		}
		return playerIds
	}

	const removeMember = (): Promise<string | null> =>
		errorCodeFrom(fn('updateTeamRoster'), {
			auth: authed(PLAYER),
			data: { teamId: TEAM, playerId: 'member-0', action: 'remove' },
		})

	describe('under team-total pricing', () => {
		beforeEach(async () => {
			await seedSeason({ teamRegistrationTotalCents: 100_000 })
		})

		it('lets a player go when ten signed players remain, paid or not', async () => {
			await seedRegisteredTeam(10, { paid: false })

			expect(await removeMember()).toBeNull()
			expect(
				(await teamRosterEntryRef(firestore, TEAM, SEASON, 'member-0').get())
					.exists
			).toBe(false)
		})

		it('still refuses a departure that would leave nine', async () => {
			await seedRegisteredTeam(9, { paid: false })

			expect(await removeMember()).toBe('failed-precondition')
		})
	})

	describe('under per-player pricing', () => {
		it('does not count signed players who have not paid', async () => {
			await seedRegisteredTeam(10, { paid: false })

			expect(await removeMember()).toBe('failed-precondition')
		})

		it('lets a player go when ten paid, signed players remain', async () => {
			await seedRegisteredTeam(10, { paid: true })

			expect(await removeMember()).toBeNull()
		})
	})
})

describe('createOffer', () => {
	let teamId: string

	beforeEach(async () => {
		await errorCodeFrom(fn('createTeam'), {
			auth: authed(PLAYER),
			data: { name: 'Captain Team', seasonId: SEASON },
		})
		teamId = (await playerSeasonRef(firestore, PLAYER, SEASON).get()).data()!
			.team!.id
		await seedPlayer('free-agent')
	})

	it('requires playerId, teamId and type', async () => {
		const code = await errorCodeFrom(fn('createOffer'), {
			auth: authed(PLAYER),
			data: { teamId, type: 'invitation' },
		})
		expect(code).toBe('invalid-argument')
	})

	it('rejects a team that does not exist', async () => {
		const code = await errorCodeFrom(fn('createOffer'), {
			auth: authed(PLAYER),
			data: {
				playerId: 'free-agent',
				teamId: 'no-such-team',
				type: 'invitation',
			},
		})
		expect(code).not.toBeNull()
	})

	it('rejects an invitation from someone who is not the team’s captain', async () => {
		// Only a captain may invite; otherwise any player could staff any team.
		await seedPlayer('random')
		const code = await errorCodeFrom(fn('createOffer'), {
			auth: authed('random'),
			data: { playerId: 'free-agent', teamId, type: 'invitation' },
		})
		expect(code).not.toBeNull()
	})
})

describe('deleteTeam', () => {
	let teamId: string

	beforeEach(async () => {
		await errorCodeFrom(fn('createTeam'), {
			auth: authed(PLAYER),
			data: { name: 'Captain Team', seasonId: SEASON },
		})
		teamId = (await playerSeasonRef(firestore, PLAYER, SEASON).get()).data()!
			.team!.id
	})

	it('refuses a caller who does not captain the team', async () => {
		await seedPlayer('outsider')
		const code = await errorCodeFrom(fn('deleteTeam'), {
			auth: authed('outsider'),
			data: { teamId, seasonId: SEASON },
		})
		expect(code).toBe('permission-denied')
	})

	it('lets the captain delete, clearing the roster entry', async () => {
		const code = await errorCodeFrom(fn('deleteTeam'), {
			auth: authed(PLAYER),
			data: { teamId, seasonId: SEASON },
		})
		expect(code).toBeNull()

		const roster = await teamRosterEntryRef(
			firestore,
			teamId,
			SEASON,
			PLAYER
		).get()
		expect(roster.exists).toBe(false)

		const playerSeason = (
			await playerSeasonRef(firestore, PLAYER, SEASON).get()
		).data()
		expect(playerSeason?.team ?? null).toBeNull()
	})
})
