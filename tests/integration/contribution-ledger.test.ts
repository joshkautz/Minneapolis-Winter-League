import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	ledgerPaidCents,
} from './helpers.js'
import {
	recordContribution,
	setContributionStatus,
	teamContributionsCollection,
} from '../../Functions/src/shared/contributions.js'
import { deleteTeamSeasonWithCleanup } from '../../Functions/src/services/teamDeletionService.js'
import { mergeTeams } from '../../Functions/src/index.js'
import { teamSeasonRef } from '../../Functions/src/shared/database.js'

/**
 * The ledger, and the invariant that keeps money from being lost.
 *
 * A team's contributions are the record of who is owed what. Deleting a
 * team-season that still holds money loses that record, and a payment nobody
 * knows about is never refunded — so every route that deletes one has to
 * settle first. Rather than remember that at each call site, the check lives
 * at the chokepoint three of the four routes already share.
 */

const SEASON = 'season-1'
const TEAM = 'team-1'
const ADMIN = 'admin-uid'

let firestore: Firestore

const seasonRef = () => firestore.collection('seasons').doc(SEASON)
const teamRef = (teamId: string) => firestore.collection('teams').doc(teamId)

const seedTeam = async (teamId: string) => {
	await teamRef(teamId).set({ createdAt: Timestamp.now(), createdBy: null })
	await teamSeasonRef(firestore, teamId, SEASON).set({
		season: seasonRef(),
		name: teamId,
		logo: null,
		storagePath: null,
		registered: false,
		registeredDate: null,
		placement: null,
	})
}

const seedPlayer = async (playerId: string, admin = false) => {
	await firestore
		.collection('players')
		.doc(playerId)
		.set({ admin, banned: false, email: `${playerId}@example.com` })
}

const add = async (
	paymentIntentId: string,
	amountCents: number,
	status: 'paid' | 'refunded' = 'paid',
	teamId = TEAM
) => {
	const outcome = await recordContribution(firestore, {
		teamId,
		seasonId: SEASON,
		playerId: 'payer',
		paymentIntentId,
		amountCents,
	})
	if (status === 'refunded') {
		await setContributionStatus(firestore, {
			teamId,
			seasonId: SEASON,
			paymentIntentId,
			status,
		})
	}
	return outcome
}

const held = (teamId = TEAM) => ledgerPaidCents(firestore, teamId, SEASON)

const ledgerSize = async (teamId = TEAM) =>
	(await teamContributionsCollection(firestore, teamId, SEASON).get()).size

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seasonRef().set({ name: '2030 Winter', dateStart: Timestamp.now() })
	await seedPlayer('payer')
	await seedTeam(TEAM)
})

describe('recording a contribution', () => {
	it('keeps the money off the public team-season document', async () => {
		// Team-season documents are world-readable. What a team has paid is
		// visible to its roster and admins only, so nothing about it may be
		// written where anyone can read it.
		await add('pi_1', 60_000)
		await setContributionStatus(firestore, {
			teamId: TEAM,
			seasonId: SEASON,
			paymentIntentId: 'pi_1',
			status: 'paid',
			amountCents: 40_000,
		})

		const teamSeason = (
			await teamSeasonRef(firestore, TEAM, SEASON).get()
		).data()
		expect(Object.keys(teamSeason ?? {}).sort()).toEqual(
			[
				'logo',
				'name',
				'placement',
				'registered',
				'registeredDate',
				'season',
				'storagePath',
			].sort()
		)
	})

	it('writes the ledger entry', async () => {
		await add('pi_1', 100_000)

		expect(await ledgerSize()).toBe(1)
		expect(await held()).toBe(100_000)
	})

	it('keys on the PaymentIntent so a redelivered webhook writes once', async () => {
		// Stripe retries. A second document would double the team's total and
		// register it on money that was only paid once.
		await add('pi_1', 100_000)
		await add('pi_1', 100_000)

		expect(await ledgerSize()).toBe(1)
		expect(await held()).toBe(100_000)
	})

	it('never rewrites a contribution already in the ledger', async () => {
		// Insert-only. A webhook redelivered after the payment was refunded
		// must not wind it back to paid; status changes go through
		// setContributionStatus and nothing else.
		await add('pi_1', 100_000, 'refunded')

		await expect(add('pi_1', 100_000)).resolves.toBe('already-recorded')

		const doc = await teamContributionsCollection(firestore, TEAM, SEASON)
			.doc('pi_1')
			.get()
		expect(doc.data()?.status).toBe('refunded')
		expect(await held()).toBe(0)
	})

	it('accumulates contributions from several payers', async () => {
		await add('pi_1', 50_000)
		await add('pi_2', 30_000)
		await add('pi_3', 20_000)

		expect(await held()).toBe(100_000)
	})

	it('refuses a contribution to a team-season that does not exist', async () => {
		await expect(
			recordContribution(firestore, {
				teamId: 'ghost',
				seasonId: SEASON,
				playerId: 'payer',
				paymentIntentId: 'pi_1',
				amountCents: 10_000,
			})
		).rejects.toThrow(/no team season/i)
	})

	it('records who paid', async () => {
		await add('pi_1', 100_000)
		const doc = await teamContributionsCollection(firestore, TEAM, SEASON)
			.doc('pi_1')
			.get()

		expect(doc.data()?.player.path).toBe('players/payer')
	})
})

describe('refunding a contribution', () => {
	beforeEach(async () => {
		await add('pi_1', 60_000)
		await add('pi_2', 40_000)
	})

	it('drops a refund from what the team holds', async () => {
		await setContributionStatus(firestore, {
			teamId: TEAM,
			seasonId: SEASON,
			paymentIntentId: 'pi_1',
			status: 'refunded',
		})

		expect(await held()).toBe(40_000)
	})

	it('records a partial refund and keeps what was first paid', async () => {
		await setContributionStatus(firestore, {
			teamId: TEAM,
			seasonId: SEASON,
			paymentIntentId: 'pi_1',
			status: 'paid',
			amountCents: 40_000,
		})

		const doc = (
			await teamContributionsCollection(firestore, TEAM, SEASON)
				.doc('pi_1')
				.get()
		).data()
		expect(doc).toMatchObject({
			status: 'paid',
			amountCents: 40_000,
			paidAmountCents: 60_000,
		})
		expect(await held()).toBe(80_000)
	})

	it('keeps the first amount paid through a second refund', async () => {
		for (const amountCents of [40_000, 20_000]) {
			await setContributionStatus(firestore, {
				teamId: TEAM,
				seasonId: SEASON,
				paymentIntentId: 'pi_1',
				status: 'paid',
				amountCents,
			})
		}

		const doc = (
			await teamContributionsCollection(firestore, TEAM, SEASON)
				.doc('pi_1')
				.get()
		).data()
		expect(doc?.paidAmountCents).toBe(60_000)
	})

	it('is a no-op when nothing has changed', async () => {
		const updatedAt = (
			await teamContributionsCollection(firestore, TEAM, SEASON)
				.doc('pi_1')
				.get()
		).data()?.updatedAt

		await expect(
			setContributionStatus(firestore, {
				teamId: TEAM,
				seasonId: SEASON,
				paymentIntentId: 'pi_1',
				status: 'paid',
				amountCents: 60_000,
			})
		).resolves.toBe('unchanged')

		// Nothing was written, so the contribution trigger does not fire for
		// a settlement that found nothing new.
		const after = (
			await teamContributionsCollection(firestore, TEAM, SEASON)
				.doc('pi_1')
				.get()
		).data()?.updatedAt
		expect(after?.isEqual(updatedAt)).toBe(true)
	})

	it('refuses to update a contribution that was never recorded', async () => {
		await expect(
			setContributionStatus(firestore, {
				teamId: TEAM,
				seasonId: SEASON,
				paymentIntentId: 'pi_nope',
				status: 'refunded',
			})
		).rejects.toThrow(/does not exist/i)
	})
})

describe('a team holding money cannot be deleted', () => {
	it('refuses while it holds a payment', async () => {
		await add('pi_1', 100_000)

		const result = await deleteTeamSeasonWithCleanup(firestore, TEAM, SEASON)

		expect(result.success).toBe(false)
		expect(result.error).toMatch(/still holds money/i)
		expect((await teamSeasonRef(firestore, TEAM, SEASON).get()).exists).toBe(
			true
		)
	})

	it('refuses when one of several contributions is still paid', async () => {
		await add('pi_1', 50_000, 'refunded')
		await add('pi_2', 50_000, 'refunded')
		await add('pi_3', 1_000)

		expect(
			(await deleteTeamSeasonWithCleanup(firestore, TEAM, SEASON)).success
		).toBe(false)
	})

	it('allows deletion once everything is refunded', async () => {
		await add('pi_1', 50_000, 'refunded')
		await add('pi_2', 50_000, 'refunded')

		const result = await deleteTeamSeasonWithCleanup(firestore, TEAM, SEASON)

		expect(result.success).toBe(true)
		expect((await teamSeasonRef(firestore, TEAM, SEASON).get()).exists).toBe(
			false
		)
	})

	it('still allows deletion of a team that never took any money', async () => {
		expect(
			(await deleteTeamSeasonWithCleanup(firestore, TEAM, SEASON)).success
		).toBe(true)
	})
})

describe('merging a team holding money', () => {
	beforeEach(async () => {
		await seedPlayer(ADMIN, true)
		// Only the canonical team document: a winner that already had a
		// season-1 record would be refused for the season collision instead,
		// which is a different rule and covered in merge-teams.test.ts.
		await teamRef('winner').set({
			createdAt: Timestamp.now(),
			createdBy: null,
		})
	})

	it('is refused while the losing team holds money', async () => {
		// mergeTeams recursively deletes the losing team, which would take
		// its contributions with it. It is the one deletion path that does
		// not go through deleteTeamSeasonWithCleanup.
		await add('pi_1', 100_000)

		expect(
			await errorCodeFrom(mergeTeams, {
				auth: authed(ADMIN),
				data: { winningTeamId: 'winner', losingTeamId: TEAM },
			})
		).toBe('failed-precondition')
		expect(await ledgerSize()).toBe(1)
	})

	it('is allowed once that money is refunded', async () => {
		await add('pi_1', 100_000, 'refunded')

		await mergeTeams.run({
			auth: authed(ADMIN),
			data: { winningTeamId: 'winner', losingTeamId: TEAM },
		} as unknown as CallableRequest<never>)

		expect((await teamRef(TEAM).get()).exists).toBe(false)
	})
})
