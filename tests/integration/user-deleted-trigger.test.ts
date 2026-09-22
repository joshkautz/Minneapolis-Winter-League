import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'

/**
 * userDeleted tears down everything belonging to a deleted account: roster
 * entries across every team, the player's season subdocs, their offers, the
 * player document and local Stripe records.
 *
 * It reaches across collections by reference, so the failure that matters is
 * it touching the wrong player. Each test here seeds a second player and
 * asserts their data survives.
 */

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const SEASON = 'season-1'
const OTHER_SEASON = 'season-2'
const TEAM = 'team-1'
const OTHER_TEAM = 'team-2'
const VICTIM = 'player-doomed'
const BYSTANDER = 'player-safe'

const seasonRef = (id = SEASON) => firestore.collection('seasons').doc(id)
const playerRef = (id: string) => firestore.collection('players').doc(id)
const teamRef = (id: string) => firestore.collection('teams').doc(id)

/** Invokes the v1 auth trigger with a minimal UserRecord. */
const fire = (uid: string) =>
	manifest.userDeleted.run({ uid, email: `${uid}@example.com` })

const seedPlayerEverywhere = async (uid: string): Promise<void> => {
	await playerRef(uid).set({
		admin: false,
		email: `${uid}@example.com`,
		firstname: 'Test',
		lastname: 'Player',
	})

	// On two teams across two seasons.
	for (const [teamId, seasonId] of [
		[TEAM, SEASON],
		[OTHER_TEAM, OTHER_SEASON],
	] as const) {
		await teamRosterEntryRef(firestore, teamId, seasonId, uid).set({
			player: playerRef(uid),
			dateJoined: Timestamp.now(),
		})
		await playerSeasonRef(firestore, uid, seasonId).set({
			season: seasonRef(seasonId),
			team: teamRef(teamId),
			paid: true,
			signed: true,
			banned: false,
			captain: false,
		})
	}

	// An outstanding offer.
	await firestore.collection('offers').doc(`offer-${uid}`).set({
		createdAt: Timestamp.now(),
		player: playerRef(uid),
		season: seasonRef(),
		team: teamRef(TEAM),
		status: 'pending',
		type: 'invitation',
	})

	// Local Stripe records.
	await firestore.collection('stripe').doc(uid).set({ stripeId: `cus_${uid}` })
	await firestore
		.collection('stripe')
		.doc(uid)
		.collection('checkouts')
		.doc('co-1')
		.set({ amount: 5000 })
	await firestore
		.collection('stripe')
		.doc(uid)
		.collection('payments')
		.doc('pay-1')
		.set({ amount: 5000 })
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
	for (const id of [SEASON, OTHER_SEASON]) {
		await seasonRef(id).set({ name: id })
	}
	for (const [teamId, seasonId] of [
		[TEAM, SEASON],
		[OTHER_TEAM, OTHER_SEASON],
	] as const) {
		await teamRef(teamId).set({ createdAt: Timestamp.now() })
		await teamSeasonRef(firestore, teamId, seasonId).set({
			season: seasonRef(seasonId),
			name: teamId,
			registered: false,
		})
	}
	await seedPlayerEverywhere(VICTIM)
	await seedPlayerEverywhere(BYSTANDER)
})

describe('userDeleted', () => {
	it('deletes the player document', async () => {
		await fire(VICTIM)
		expect((await playerRef(VICTIM).get()).exists).toBe(false)
	})

	it('deletes roster entries across every team and season', async () => {
		await fire(VICTIM)
		expect(
			(await teamRosterEntryRef(firestore, TEAM, SEASON, VICTIM).get()).exists
		).toBe(false)
		expect(
			(
				await teamRosterEntryRef(
					firestore,
					OTHER_TEAM,
					OTHER_SEASON,
					VICTIM
				).get()
			).exists
		).toBe(false)
	})

	it('deletes every player season subdoc', async () => {
		await fire(VICTIM)
		const seasons = await playerRef(VICTIM)
			.collection('playerSeasons')
			.get()
		expect(seasons.empty).toBe(true)
	})

	it('deletes the player’s offers', async () => {
		await fire(VICTIM)
		expect(
			(await firestore.collection('offers').doc(`offer-${VICTIM}`).get()).exists
		).toBe(false)
	})

	it('deletes local Stripe records but is scoped to this user', async () => {
		await fire(VICTIM)
		const stripeDoc = await firestore.collection('stripe').doc(VICTIM).get()
		expect(stripeDoc.exists).toBe(false)
		expect(
			(
				await firestore
					.collection('stripe')
					.doc(VICTIM)
					.collection('checkouts')
					.get()
			).empty
		).toBe(true)
		expect(
			(
				await firestore
					.collection('stripe')
					.doc(VICTIM)
					.collection('payments')
					.get()
			).empty
		).toBe(true)
	})

	it('leaves every other player untouched', async () => {
		// The trigger reaches across collections by reference; a wrong query
		// here would delete a bystander's roster spot or payment history.
		await fire(VICTIM)

		expect((await playerRef(BYSTANDER).get()).exists).toBe(true)
		expect(
			(await teamRosterEntryRef(firestore, TEAM, SEASON, BYSTANDER).get()).exists
		).toBe(true)
		expect(
			(await playerSeasonRef(firestore, BYSTANDER, SEASON).get()).exists
		).toBe(true)
		expect(
			(await firestore.collection('offers').doc(`offer-${BYSTANDER}`).get())
				.exists
		).toBe(true)
		expect(
			(await firestore.collection('stripe').doc(BYSTANDER).get()).exists
		).toBe(true)
	})

	it('leaves the teams themselves in place', async () => {
		// Deleting an account must not delete the teams they played on.
		await fire(VICTIM)
		expect((await teamRef(TEAM).get()).exists).toBe(true)
		expect((await teamSeasonRef(firestore, TEAM, SEASON).get()).exists).toBe(
			true
		)
	})

	it('returns quietly when there is no player document', async () => {
		await expect(fire('never-existed')).resolves.toBeUndefined()
	})

	it('early-returns while a migration is in progress', async () => {
		await firestore.doc('system/maintenance').set({ migrationInProgress: true })
		await fire(VICTIM)
		expect((await playerRef(VICTIM).get()).exists).toBe(true)
	})
})
