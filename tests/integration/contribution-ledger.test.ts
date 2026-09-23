import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
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
 * team-season that still holds money loses that record, and a hold nobody
 * knows about is never cancelled — so every route that deletes one has to
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

const add = (
	paymentIntentId: string,
	amountCents: number,
	status: 'authorized' | 'captured' | 'canceled' | 'refunded' = 'authorized',
	teamId = TEAM
) =>
	recordContribution(firestore, {
		teamId,
		seasonId: SEASON,
		playerId: 'payer',
		paymentIntentId,
		amountCents,
		status,
	})

const totals = async (teamId = TEAM) => {
	const data = (await teamSeasonRef(firestore, teamId, SEASON).get()).data()
	return {
		authorizedCents: data?.authorizedCents,
		capturedCents: data?.capturedCents,
	}
}

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
	it('writes the ledger entry and the totals together', async () => {
		await add('pi_1', 100_000)

		expect(await ledgerSize()).toBe(1)
		expect(await totals()).toEqual({
			authorizedCents: 100_000,
			capturedCents: 0,
		})
	})

	it('keys on the PaymentIntent so a redelivered webhook writes once', async () => {
		// Stripe retries. A second document would double the team's total and
		// register it on money that was never committed twice.
		await add('pi_1', 100_000)
		await add('pi_1', 100_000)

		expect(await ledgerSize()).toBe(1)
		expect((await totals()).authorizedCents).toBe(100_000)
	})

	it('never rewrites a contribution already in the ledger', async () => {
		// Insert-only. A webhook redelivered after the hold was captured must
		// not wind it back to authorized; status changes go through
		// setContributionStatus and nothing else.
		await add('pi_1', 100_000)
		await setContributionStatus(firestore, {
			teamId: TEAM,
			seasonId: SEASON,
			paymentIntentId: 'pi_1',
			status: 'captured',
		})

		await expect(add('pi_1', 100_000)).resolves.toBe('already-recorded')

		const doc = await teamContributionsCollection(firestore, TEAM, SEASON)
			.doc('pi_1')
			.get()
		expect(doc.data()?.status).toBe('captured')
		expect(await totals()).toEqual({
			authorizedCents: 0,
			capturedCents: 100_000,
		})
	})

	it('accumulates contributions from several payers', async () => {
		await add('pi_1', 50_000)
		await add('pi_2', 30_000)
		await add('pi_3', 20_000)

		expect((await totals()).authorizedCents).toBe(100_000)
	})

	it('refuses a contribution to a team-season that does not exist', async () => {
		await expect(
			recordContribution(firestore, {
				teamId: 'ghost',
				seasonId: SEASON,
				playerId: 'payer',
				paymentIntentId: 'pi_1',
				amountCents: 10_000,
				status: 'authorized',
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

describe('moving a contribution through its lifecycle', () => {
	beforeEach(async () => {
		await add('pi_1', 60_000)
		await add('pi_2', 40_000)
	})

	it('moves money from authorized to captured', async () => {
		await setContributionStatus(firestore, {
			teamId: TEAM,
			seasonId: SEASON,
			paymentIntentId: 'pi_1',
			status: 'captured',
		})

		expect(await totals()).toEqual({
			authorizedCents: 40_000,
			capturedCents: 60_000,
		})
	})

	it('drops a cancelled hold from both totals', async () => {
		await setContributionStatus(firestore, {
			teamId: TEAM,
			seasonId: SEASON,
			paymentIntentId: 'pi_1',
			status: 'canceled',
		})

		expect(await totals()).toEqual({
			authorizedCents: 40_000,
			capturedCents: 0,
		})
	})

	it('drops a refund from both totals', async () => {
		await setContributionStatus(firestore, {
			teamId: TEAM,
			seasonId: SEASON,
			paymentIntentId: 'pi_1',
			status: 'captured',
		})
		await setContributionStatus(firestore, {
			teamId: TEAM,
			seasonId: SEASON,
			paymentIntentId: 'pi_1',
			status: 'refunded',
		})

		expect(await totals()).toEqual({
			authorizedCents: 40_000,
			capturedCents: 0,
		})
	})

	it('is a no-op when the status is already set', async () => {
		await setContributionStatus(firestore, {
			teamId: TEAM,
			seasonId: SEASON,
			paymentIntentId: 'pi_1',
			status: 'captured',
		})
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
				status: 'captured',
			})
		).resolves.toBe('unchanged')

		expect((await totals()).capturedCents).toBe(60_000)
		// Nothing was written, so the contribution trigger does not fire for
		// a settlement that found nothing new.
		const after = (
			await teamContributionsCollection(firestore, TEAM, SEASON)
				.doc('pi_1')
				.get()
		).data()?.updatedAt
		expect(after?.isEqual(updatedAt)).toBe(true)
	})

	it('records a partial capture and keeps what was first authorized', async () => {
		await setContributionStatus(firestore, {
			teamId: TEAM,
			seasonId: SEASON,
			paymentIntentId: 'pi_1',
			status: 'captured',
			amountCents: 40_000,
		})

		const doc = (
			await teamContributionsCollection(firestore, TEAM, SEASON)
				.doc('pi_1')
				.get()
		).data()
		expect(doc).toMatchObject({
			status: 'captured',
			amountCents: 40_000,
			authorizedAmountCents: 60_000,
		})
		expect((await totals()).capturedCents).toBe(40_000)
	})

	it('refuses to update a contribution that was never recorded', async () => {
		await expect(
			setContributionStatus(firestore, {
				teamId: TEAM,
				seasonId: SEASON,
				paymentIntentId: 'pi_nope',
				status: 'captured',
			})
		).rejects.toThrow(/does not exist/i)
	})
})

describe('a team holding money cannot be deleted', () => {
	it('refuses while a hold is outstanding', async () => {
		await add('pi_1', 100_000)

		const result = await deleteTeamSeasonWithCleanup(firestore, TEAM, SEASON)

		expect(result.success).toBe(false)
		expect(result.error).toMatch(/money still committed/i)
		expect((await teamSeasonRef(firestore, TEAM, SEASON).get()).exists).toBe(
			true
		)
	})

	it('refuses while money has been captured', async () => {
		await add('pi_1', 100_000, 'captured')

		const result = await deleteTeamSeasonWithCleanup(firestore, TEAM, SEASON)

		expect(result.success).toBe(false)
	})

	it('refuses when one of several contributions is still live', async () => {
		await add('pi_1', 50_000, 'canceled')
		await add('pi_2', 50_000, 'refunded')
		await add('pi_3', 1_000, 'authorized')

		expect(
			(await deleteTeamSeasonWithCleanup(firestore, TEAM, SEASON)).success
		).toBe(false)
	})

	it('allows deletion once everything is settled', async () => {
		await add('pi_1', 50_000, 'canceled')
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

	it('is refused while the losing team has unsettled money', async () => {
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

	it('is allowed once that money is settled', async () => {
		await add('pi_1', 100_000, 'refunded')

		await mergeTeams.run({
			auth: authed(ADMIN),
			data: { winningTeamId: 'winner', losingTeamId: TEAM },
		} as unknown as CallableRequest<never>)

		expect((await teamRef(TEAM).get()).exists).toBe(false)
	})
})
