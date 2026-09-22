import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import {
	addPlayerToTeam,
	removePlayerFromTeam,
	setPlayerCaptainStatus,
} from '../../Functions/src/shared/membership.js'
import {
	canonicalPlayerIdFromPlayerSeasonDoc,
	canonicalTeamIdFromTeamSeasonDoc,
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'

/**
 * Integration tests for the membership helpers, against the real Firestore
 * emulator.
 *
 * "Player X is on team Y this season" is stored twice on purpose — once as a
 * roster entry under the team-season, once as `team` on the player-season —
 * because both directions are hot reads and Firestore has no joins. These
 * helpers exist to keep the two sides from drifting, so what has to be tested
 * is the invariant across both documents after a real transaction commits.
 *
 * Mocks cannot catch a wrong collection path or a transaction that only
 * half-applies, which is exactly the failure mode here. Run with
 * `npm run test:integration`.
 */

let app: App
let firestore: Firestore

const SEASON = 'season-1'
const TEAM = 'team-1'
const PLAYER = 'player-1'

const seasonRef = () => firestore.collection('seasons').doc(SEASON)

/** Reads both sides of the relationship in one go. */
const readBothSides = async (
	playerId = PLAYER,
	teamId = TEAM,
	seasonId = SEASON
) => {
	const [roster, playerSeason] = await Promise.all([
		teamRosterEntryRef(firestore, teamId, seasonId, playerId).get(),
		playerSeasonRef(firestore, playerId, seasonId).get(),
	])
	return {
		rosterExists: roster.exists,
		rosterData: roster.data(),
		playerSeason: playerSeason.data(),
	}
}

beforeAll(async () => {
	process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
	app = initializeApp({ projectId: 'mwl-integration-test' }, 'integration')
	firestore = getFirestore(app)
})

afterAll(async () => {
	await deleteApp(app)
})

beforeEach(async () => {
	await firestore.recursiveDelete(firestore.collection('teams'))
	await firestore.recursiveDelete(firestore.collection('players'))
	await firestore.recursiveDelete(firestore.collection('seasons'))

	await seasonRef().set({ name: '2026 Winter' })
	await firestore.collection('teams').doc(TEAM).set({ createdAt: new Date() })
	await teamSeasonRef(firestore, TEAM, SEASON).set({
		season: seasonRef(),
		name: 'Test Team',
		registered: false,
	})
	await firestore
		.collection('players')
		.doc(PLAYER)
		.set({ admin: false, email: 'p@example.com', firstname: 'P', lastname: 'One' })
})

describe('addPlayerToTeam', () => {
	it('writes both sides of the relationship', async () => {
		await firestore.runTransaction(async (tx) => {
			addPlayerToTeam(tx, firestore, {
				playerId: PLAYER,
				teamId: TEAM,
				seasonId: SEASON,
				seasonRef: seasonRef(),
				existingPlayerSeason: null,
			})
		})

		const { rosterExists, rosterData, playerSeason } = await readBothSides()
		expect(rosterExists).toBe(true)
		expect(rosterData?.player.id).toBe(PLAYER)
		expect(rosterData?.dateJoined).toBeDefined()
		expect(playerSeason?.team?.id).toBe(TEAM)
	})

	it('creates a player season with safe defaults when none exists', async () => {
		await firestore.runTransaction(async (tx) => {
			addPlayerToTeam(tx, firestore, {
				playerId: PLAYER,
				teamId: TEAM,
				seasonId: SEASON,
				seasonRef: seasonRef(),
				existingPlayerSeason: null,
			})
		})

		const { playerSeason } = await readBothSides()
		// A brand new season must not imply paid or signed.
		expect(playerSeason).toMatchObject({
			paid: false,
			signed: false,
			banned: false,
			captain: false,
		})
	})

	it('preserves paid, signed and banned when a season already exists', async () => {
		// The regression this guards: overwriting the subdoc on a team change
		// would silently clear a player's payment and waiver status.
		const existing = {
			season: seasonRef(),
			team: null,
			paid: true,
			signed: true,
			banned: true,
			captain: false,
		}
		await playerSeasonRef(firestore, PLAYER, SEASON).set(existing)

		await firestore.runTransaction(async (tx) => {
			addPlayerToTeam(tx, firestore, {
				playerId: PLAYER,
				teamId: TEAM,
				seasonId: SEASON,
				seasonRef: seasonRef(),
				existingPlayerSeason: existing,
			})
		})

		const { playerSeason } = await readBothSides()
		expect(playerSeason).toMatchObject({ paid: true, signed: true, banned: true })
		expect(playerSeason?.team?.id).toBe(TEAM)
	})

	it('records captaincy on the player season, not the roster entry', async () => {
		await firestore.runTransaction(async (tx) => {
			addPlayerToTeam(tx, firestore, {
				playerId: PLAYER,
				teamId: TEAM,
				seasonId: SEASON,
				seasonRef: seasonRef(),
				captain: true,
				existingPlayerSeason: null,
			})
		})

		const { rosterData, playerSeason } = await readBothSides()
		expect(playerSeason?.captain).toBe(true)
		// The roster entry is a pure membership join.
		expect(rosterData).not.toHaveProperty('captain')
	})
})

describe('removePlayerFromTeam', () => {
	beforeEach(async () => {
		await firestore.runTransaction(async (tx) => {
			addPlayerToTeam(tx, firestore, {
				playerId: PLAYER,
				teamId: TEAM,
				seasonId: SEASON,
				seasonRef: seasonRef(),
				captain: true,
				existingPlayerSeason: null,
			})
		})
	})

	it('clears both sides', async () => {
		await firestore.runTransaction(async (tx) => {
			removePlayerFromTeam(tx, firestore, {
				playerId: PLAYER,
				teamId: TEAM,
				seasonId: SEASON,
			})
		})

		const { rosterExists, playerSeason } = await readBothSides()
		expect(rosterExists).toBe(false)
		expect(playerSeason?.team).toBeNull()
	})

	it('revokes captaincy on the way out', async () => {
		await firestore.runTransaction(async (tx) => {
			removePlayerFromTeam(tx, firestore, {
				playerId: PLAYER,
				teamId: TEAM,
				seasonId: SEASON,
			})
		})

		const { playerSeason } = await readBothSides()
		expect(playerSeason?.captain).toBe(false)
	})

	it('keeps the player season document, with paid and signed intact', async () => {
		// The subdoc still carries state that outlives team membership.
		await playerSeasonRef(firestore, PLAYER, SEASON).update({
			paid: true,
			signed: true,
		})

		await firestore.runTransaction(async (tx) => {
			removePlayerFromTeam(tx, firestore, {
				playerId: PLAYER,
				teamId: TEAM,
				seasonId: SEASON,
			})
		})

		const { playerSeason } = await readBothSides()
		expect(playerSeason).toBeDefined()
		expect(playerSeason).toMatchObject({ paid: true, signed: true })
	})
})

describe('setPlayerCaptainStatus', () => {
	beforeEach(async () => {
		await firestore.runTransaction(async (tx) => {
			addPlayerToTeam(tx, firestore, {
				playerId: PLAYER,
				teamId: TEAM,
				seasonId: SEASON,
				seasonRef: seasonRef(),
				existingPlayerSeason: null,
			})
		})
	})

	it('promotes and demotes without touching membership', async () => {
		await firestore.runTransaction(async (tx) => {
			setPlayerCaptainStatus(tx, firestore, {
				playerId: PLAYER,
				seasonId: SEASON,
				captain: true,
			})
		})
		let state = await readBothSides()
		expect(state.playerSeason?.captain).toBe(true)
		expect(state.rosterExists).toBe(true)
		expect(state.playerSeason?.team?.id).toBe(TEAM)

		await firestore.runTransaction(async (tx) => {
			setPlayerCaptainStatus(tx, firestore, {
				playerId: PLAYER,
				seasonId: SEASON,
				captain: false,
			})
		})
		state = await readBothSides()
		expect(state.playerSeason?.captain).toBe(false)
		expect(state.rosterExists).toBe(true)
	})
})

describe('transaction atomicity', () => {
	it('leaves neither side written when the transaction throws', async () => {
		// A partial apply is the worst outcome: a roster entry with no
		// corresponding player season, or the reverse.
		await expect(
			firestore.runTransaction(async (tx) => {
				addPlayerToTeam(tx, firestore, {
					playerId: PLAYER,
					teamId: TEAM,
					seasonId: SEASON,
					seasonRef: seasonRef(),
					existingPlayerSeason: null,
				})
				throw new Error('caller aborted after staging writes')
			})
		).rejects.toThrow('caller aborted')

		const { rosterExists, playerSeason } = await readBothSides()
		expect(rosterExists).toBe(false)
		expect(playerSeason).toBeUndefined()
	})
})

describe('canonical id derivation', () => {
	it('recovers the team id from a team-season snapshot', async () => {
		const snap = await teamSeasonRef(firestore, TEAM, SEASON).get()
		expect(canonicalTeamIdFromTeamSeasonDoc(snap)).toBe(TEAM)
	})

	it('recovers the player id from a player-season snapshot', async () => {
		await firestore.runTransaction(async (tx) => {
			addPlayerToTeam(tx, firestore, {
				playerId: PLAYER,
				teamId: TEAM,
				seasonId: SEASON,
				seasonRef: seasonRef(),
				existingPlayerSeason: null,
			})
		})
		const snap = await playerSeasonRef(firestore, PLAYER, SEASON).get()
		expect(canonicalPlayerIdFromPlayerSeasonDoc(snap)).toBe(PLAYER)
	})

	it('works through a collection group query, which is how the App reads it', async () => {
		await firestore.runTransaction(async (tx) => {
			addPlayerToTeam(tx, firestore, {
				playerId: PLAYER,
				teamId: TEAM,
				seasonId: SEASON,
				seasonRef: seasonRef(),
				existingPlayerSeason: null,
			})
		})
		const group = await firestore.collectionGroup('roster').get()
		expect(group.size).toBe(1)
		expect(group.docs[0].ref.parent.parent?.id).toBe(SEASON)
	})
})
