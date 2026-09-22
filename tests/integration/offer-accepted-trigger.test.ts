import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'

/**
 * onOfferUpdated is how a player actually joins a team: when an offer flips
 * from pending to accepted, this trigger writes both sides of the membership
 * relationship and cancels the player's other pending offers so they cannot
 * end up on two rosters.
 *
 * It runs unattended, and on failure it records the reason on the offer
 * document rather than surfacing anything — so a regression here is silent
 * and leaves offers stuck.
 */

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const SEASON = 'season-1'
const TEAM = 'team-1'
const OTHER_TEAM = 'team-2'
const PLAYER = 'player-1'

const seasonRef = () => firestore.collection('seasons').doc(SEASON)
const playerRef = (id = PLAYER) => firestore.collection('players').doc(id)
const teamRef = (id = TEAM) => firestore.collection('teams').doc(id)

const offerDoc = (overrides: Record<string, unknown> = {}) => ({
	createdAt: Timestamp.now(),
	player: playerRef(),
	season: seasonRef(),
	team: teamRef(),
	status: 'pending',
	type: 'invitation',
	...overrides,
})

const snap = (data: Record<string, unknown>) => ({
	exists: true,
	data: () => data,
})

/** Fires the trigger for an offer transitioning between two statuses. */
const fire = (offerId: string, before: string, after: string) =>
	manifest.onOfferUpdated.run({
		id: 'evt-1',
		params: { offerId },
		data: {
			before: snap(offerDoc({ status: before })),
			after: snap(offerDoc({ status: after })),
		},
	})

const seedTeam = async (teamId: string): Promise<void> => {
	await teamRef(teamId).set({ createdAt: Timestamp.now() })
	await teamSeasonRef(firestore, teamId, SEASON).set({
		season: seasonRef(),
		name: `Team ${teamId}`,
		registered: false,
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
	await seasonRef().set({ name: '2030 Winter' })
	await seedTeam(TEAM)
	await seedTeam(OTHER_TEAM)
	await playerRef().set({ admin: false, email: 'p@example.com' })
})

describe('onOfferUpdated', () => {
	it('puts the player on the team, writing both sides', async () => {
		await firestore.collection('offers').doc('offer-1').set(offerDoc())
		await fire('offer-1', 'pending', 'accepted')

		const roster = await teamRosterEntryRef(
			firestore,
			TEAM,
			SEASON,
			PLAYER
		).get()
		expect(roster.exists).toBe(true)

		const playerSeason = (
			await playerSeasonRef(firestore, PLAYER, SEASON).get()
		).data()
		expect(playerSeason?.team?.id).toBe(TEAM)
		// Accepting an offer never confers captaincy.
		expect(playerSeason?.captain).toBe(false)
	})

	it('marks the offer processed', async () => {
		await firestore.collection('offers').doc('offer-1').set(offerDoc())
		await fire('offer-1', 'pending', 'accepted')

		const offer = (await firestore.collection('offers').doc('offer-1').get()).data()
		expect(offer?.processed).toBe(true)
		expect(offer?.processingError).toBeUndefined()
	})

	it('cancels the player’s other pending offers for that season', async () => {
		// Otherwise a player could accept two offers and land on two rosters.
		await firestore.collection('offers').doc('offer-1').set(offerDoc())
		await firestore
			.collection('offers')
			.doc('offer-2')
			.set(offerDoc({ team: teamRef(OTHER_TEAM) }))

		await fire('offer-1', 'pending', 'accepted')

		const other = (await firestore.collection('offers').doc('offer-2').get()).data()
		expect(other?.status).toBe('canceled')
		expect(other?.canceledReason).toMatch(/another team/i)
	})

	it('leaves another player’s pending offers alone', async () => {
		await playerRef('player-2').set({ admin: false, email: 'p2@example.com' })
		await firestore.collection('offers').doc('offer-1').set(offerDoc())
		await firestore
			.collection('offers')
			.doc('offer-other-player')
			.set(offerDoc({ player: playerRef('player-2') }))

		await fire('offer-1', 'pending', 'accepted')

		const other = (
			await firestore.collection('offers').doc('offer-other-player').get()
		).data()
		expect(other?.status).toBe('pending')
	})

	it('leaves the same player’s offers for a different season alone', async () => {
		await firestore.collection('seasons').doc('season-2').set({ name: '2031' })
		await firestore.collection('offers').doc('offer-1').set(offerDoc())
		await firestore
			.collection('offers')
			.doc('offer-next-season')
			.set(
				offerDoc({ season: firestore.collection('seasons').doc('season-2') })
			)

		await fire('offer-1', 'pending', 'accepted')

		const other = (
			await firestore.collection('offers').doc('offer-next-season').get()
		).data()
		expect(other?.status).toBe('pending')
	})

	it.each([
		['rejected', 'accepted'],
		['pending', 'rejected'],
		['pending', 'canceled'],
		['accepted', 'accepted'],
	])('ignores a %s to %s transition', async (before, after) => {
		await firestore.collection('offers').doc('offer-1').set(offerDoc())
		await fire('offer-1', before, after)

		const roster = await teamRosterEntryRef(
			firestore,
			TEAM,
			SEASON,
			PLAYER
		).get()
		expect(roster.exists).toBe(false)
	})

	it('refuses to move a player who is already on a team', async () => {
		// The offer records why rather than throwing, because a thrown error
		// would be retried indefinitely.
		await playerSeasonRef(firestore, PLAYER, SEASON).set({
			season: seasonRef(),
			team: teamRef(OTHER_TEAM),
			paid: false,
			signed: false,
			banned: false,
			captain: false,
		})
		await firestore.collection('offers').doc('offer-1').set(offerDoc())

		await fire('offer-1', 'pending', 'accepted')

		const offer = (await firestore.collection('offers').doc('offer-1').get()).data()
		expect(offer?.processed).toBe(false)
		expect(offer?.processingError).toMatch(/already on a team/i)

		// The existing membership is untouched.
		const playerSeason = (
			await playerSeasonRef(firestore, PLAYER, SEASON).get()
		).data()
		expect(playerSeason?.team?.id).toBe(OTHER_TEAM)
	})

	it('records an error when the team is not in that season', async () => {
		await teamSeasonRef(firestore, TEAM, SEASON).delete()
		await firestore.collection('offers').doc('offer-1').set(offerDoc())

		await fire('offer-1', 'pending', 'accepted')

		const offer = (await firestore.collection('offers').doc('offer-1').get()).data()
		expect(offer?.processed).toBe(false)
		expect(offer?.processingError).toMatch(/not participating/i)
	})

	it('early-returns while a migration is in progress', async () => {
		await firestore.doc('system/maintenance').set({ migrationInProgress: true })
		await firestore.collection('offers').doc('offer-1').set(offerDoc())

		await fire('offer-1', 'pending', 'accepted')

		const roster = await teamRosterEntryRef(
			firestore,
			TEAM,
			SEASON,
			PLAYER
		).get()
		expect(roster.exists).toBe(false)
	})
})
