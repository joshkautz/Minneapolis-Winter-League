import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	type Callable,
	ledgerPaidCents,
} from './helpers.js'
import {
	addPayment,
	failNext,
	FakeStripe,
	fakeStripe,
	resetFakeStripe,
} from './fake-stripe.js'
import { TEAM_CONFIG } from '../../Functions/src/config/constants.js'
import {
	recordContribution,
	teamContributionsCollection,
} from '../../Functions/src/shared/contributions.js'
import {
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'
import { sweepTeamPayments } from '../../Functions/src/services/teamPaymentsSweep.js'
import {
	RECONCILIATION_LOOKBACK_DAYS,
	reconcileTeamPayments,
	recentTeamPaymentsQuery,
} from '../../Functions/src/services/teamPaymentsReconciliation.js'

/**
 * The parts of settlement that run on a clock, and the admin's manual
 * refund.
 *
 * Triggers settle a team when something happens to it. These cover what
 * happens because time passes — registration closing — and what catches an
 * event that was lost: the daily reconciliation between Stripe and the
 * ledger.
 */

vi.mock('stripe', async () => ({
	default: (await import('./fake-stripe.js')).FakeStripe,
}))

const TOTAL = 100_000
const LOCK = TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK
const SEASON = 'season-1'
const DAY_MS = 24 * 60 * 60 * 1000
const REGISTRATION_END = Date.now() + 10 * DAY_MS
const AFTER_CLOSE = new Date(REGISTRATION_END + 1000)

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const seasonRef = (id = SEASON) => firestore.collection('seasons').doc(id)

const seedSeason = async (
	id = SEASON,
	overrides: Record<string, unknown> = {}
) => {
	await seasonRef(id).set({
		name: id,
		dateStart: Timestamp.now(),
		registrationStart: Timestamp.fromMillis(Date.now() - DAY_MS),
		registrationEnd: Timestamp.fromMillis(REGISTRATION_END),
		registeredTeamCount: 0,
		teamRegistrationTotalCents: TOTAL,
		...overrides,
	})
}

const seedTeam = async (
	teamId: string,
	registered = false,
	season = SEASON
) => {
	await firestore.collection('teams').doc(teamId).set({ teamId })
	await teamSeasonRef(firestore, teamId, season).set({
		season: seasonRef(season),
		name: teamId,
		logo: null,
		storagePath: null,
		placement: null,
		registered,
		registeredDate: registered ? Timestamp.now() : null,
	} as never)
}

const metadataFor = (teamId: string, seasonId = SEASON) => ({
	kind: 'team_contribution',
	firebaseUID: 'payer',
	teamId,
	seasonId,
})

/** A payment in Stripe and, unless told otherwise, in the ledger. */
const pay = async (
	paymentIntentId: string,
	amountCents: number,
	teamId: string,
	options: { inLedger?: boolean; seasonId?: string } = {}
) => {
	const seasonId = options.seasonId ?? SEASON
	addPayment(paymentIntentId, amountCents, metadataFor(teamId, seasonId))
	if (options.inLedger === false) return
	// The payer is on the team: money from someone who has left is refunded.
	await teamRosterEntryRef(firestore, teamId, seasonId, 'payer').set({
		player: firestore.collection('players').doc('payer'),
		dateJoined: Timestamp.now(),
	})
	await recordContribution(firestore, {
		teamId,
		seasonId,
		playerId: 'payer',
		paymentIntentId,
		amountCents,
	})
}

const refundedInDashboard = (paymentIntentId: string, amountCents: number) => {
	fakeStripe.intents.get(paymentIntentId)!.latest_charge.amount_refunded =
		amountCents
}

const entry = async (teamId: string, paymentIntentId: string) =>
	(
		await teamContributionsCollection(firestore, teamId, SEASON)
			.doc(paymentIntentId)
			.get()
	).data()

const stripeCalls = () =>
	fakeStripe.calls.map((c) => `${c.method} ${c.paymentIntentId} ${c.amount}`)

beforeAll(async () => {
	process.env.STRIPE_SECRET_KEY ??= 'sk_test_integration'
	firestore = initTestApp()
	manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
})

beforeEach(async () => {
	resetFakeStripe()
	await resetFirestore(firestore)
	await seedSeason()
})

describe('the hourly sweep', () => {
	it('refunds unregistered teams once registration closes', async () => {
		await seedTeam('team-a')
		await seedTeam('team-b')
		await pay('pi_a', 60_000, 'team-a')
		await pay('pi_b', 40_000, 'team-b')

		const result = await sweepTeamPayments({ now: AFTER_CLOSE })

		expect(stripeCalls().sort()).toEqual([
			'refund pi_a 60000',
			'refund pi_b 40000',
		])
		expect(result).toEqual({ teamsChecked: 2, teamsActedOn: 2, failures: [] })
	})

	it('does nothing to a team still in the running', async () => {
		await seedTeam('team-a')
		await pay('pi_a', 60_000, 'team-a')

		await sweepTeamPayments()

		expect(stripeCalls()).toEqual([])
	})

	it('passes over a registered team, whose money its triggers settle', async () => {
		// Past seasons cost a query per team and no settlement.
		await seedTeam('team-a', true)
		await seasonRef().update({ registeredTeamCount: 1 })
		await pay('pi_a', TOTAL, 'team-a')

		const result = await sweepTeamPayments({ now: AFTER_CLOSE })

		expect(result.teamsChecked).toBe(0)
		expect(stripeCalls()).toEqual([])
	})

	it('skips teams that hold no money', async () => {
		await seedTeam('team-a')
		await pay('pi_a', 60_000, 'team-a')
		refundedInDashboard('pi_a', 60_000)
		await sweepTeamPayments({ now: AFTER_CLOSE })
		await seedTeam('team-b')
		fakeStripe.calls.length = 0

		expect(await sweepTeamPayments({ now: AFTER_CLOSE })).toEqual({
			teamsChecked: 0,
			teamsActedOn: 0,
			failures: [],
		})
	})

	it('ignores a season on per-player pricing', async () => {
		await seedSeason('season-old', { teamRegistrationTotalCents: null })
		await seedTeam('team-old', false, 'season-old')
		await pay('pi_old', 50_000, 'team-old', { seasonId: 'season-old' })

		const result = await sweepTeamPayments({ now: AFTER_CLOSE })

		expect(result.teamsChecked).toBe(0)
		expect(stripeCalls()).toEqual([])
	})

	it('covers every season on team payments, not just the current one', async () => {
		// Money from last season is still money, whichever season is newest.
		await seedSeason('season-2', {
			dateStart: Timestamp.fromMillis(Date.now() + DAY_MS),
		})
		await seedTeam('team-a')
		await pay('pi_a', 50_000, 'team-a')

		await sweepTeamPayments({ now: AFTER_CLOSE })

		expect(stripeCalls()).toEqual(['refund pi_a 50000'])
	})

	it('settles the other teams when one fails', async () => {
		await seedTeam('team-a')
		await seedTeam('team-b')
		await pay('pi_a', 60_000, 'team-a')
		await pay('pi_b', 40_000, 'team-b')
		failNext('refund', 'pi_a')

		const result = await sweepTeamPayments({ now: AFTER_CLOSE })

		expect(stripeCalls()).toEqual(['refund pi_b 40000'])
		expect(result.failures).toEqual([
			expect.objectContaining({ teamId: 'team-a', seasonId: SEASON }),
		])
	})

	describe('as scheduled', () => {
		const run = () =>
			manifest.sweepTeamPaymentsHourly.run({
				scheduleTime: new Date().toISOString(),
			})

		beforeEach(async () => {
			// Registration has closed, so any unregistered money is refunded.
			await seasonRef().update({
				registrationEnd: Timestamp.fromMillis(Date.now() - 1000),
			})
			await seedTeam('team-a')
			await pay('pi_a', 60_000, 'team-a')
		})

		it('runs the sweep', async () => {
			await run()
			expect(stripeCalls()).toEqual(['refund pi_a 60000'])
		})

		it('throws when a team could not be settled, so the failure is seen', async () => {
			failNext('refund', 'pi_a')
			await expect(run()).rejects.toThrow(/1 of 1 team/)
		})

		it('does nothing while a migration is in progress', async () => {
			await firestore
				.doc('system/maintenance')
				.set({ migrationInProgress: true })
			await run()
			expect(stripeCalls()).toEqual([])
		})
	})
})

describe('the daily reconciliation', () => {
	const NOW = new Date()
	const reconcile = () =>
		reconcileTeamPayments({ stripe: new FakeStripe() as never, now: NOW })

	it('asks Stripe for recent team payments and nothing else', async () => {
		await reconcile()

		const since =
			Math.floor(NOW.getTime() / 1000) -
			RECONCILIATION_LOOKBACK_DAYS * 24 * 60 * 60
		expect(fakeStripe.searches).toEqual([recentTeamPaymentsQuery(NOW)])
		expect(recentTeamPaymentsQuery(NOW)).toBe(
			`status:'succeeded' AND metadata['kind']:'team_contribution' AND created>${since}`
		)
	})

	it('looks back further than any registration window', () => {
		// A missed payment must be found before the window it belongs to
		// could have closed and been settled without it.
		expect(RECONCILIATION_LOOKBACK_DAYS).toBeGreaterThan(31)
	})

	it('records a payment the webhook never delivered', async () => {
		// Otherwise the money is invisible: the team is not credited with it,
		// and nothing would ever refund it.
		await seedTeam('team-a')
		await pay('pi_lost', 50_000, 'team-a', { inLedger: false })

		const report = await reconcile()

		expect(report.unrecordedPayments).toEqual([
			{ paymentIntentId: 'pi_lost', outcome: 'recorded' },
		])
		expect(await entry('team-a', 'pi_lost')).toMatchObject({
			status: 'paid',
			amountCents: 50_000,
		})
	})

	it('refunds a lost payment whose team no longer exists', async () => {
		await pay('pi_orphan', 50_000, 'team-gone', { inLedger: false })

		const report = await reconcile()

		expect(report.unrecordedPayments).toEqual([
			{ paymentIntentId: 'pi_orphan', outcome: 'refunded-unattributable' },
		])
		expect(stripeCalls()).toEqual(['refund pi_orphan 50000'])
	})

	it('passes over a payment already refunded in full, day after day', async () => {
		// An unattributable payment refunded yesterday is still in the
		// search. It is not missing, so it is not reported.
		await pay('pi_orphan', 50_000, 'team-gone', { inLedger: false })
		refundedInDashboard('pi_orphan', 50_000)

		const report = await reconcile()

		expect(report.unrecordedPayments).toEqual([])
		expect(stripeCalls()).toEqual([])
	})

	it('leaves payments the ledger already has alone', async () => {
		await seedTeam('team-a')
		await pay('pi_a', 50_000, 'team-a')

		const report = await reconcile()

		expect(report).toEqual({
			unrecordedPayments: [],
			corrected: [],
			failures: [],
		})
		expect(stripeCalls()).toEqual([])
	})

	it('corrects a refund issued in the Dashboard, so it stops counting', async () => {
		// Registration counts paid money. A payment refunded elsewhere that
		// the ledger still called paid would count toward a team's total.
		await seedTeam('team-a')
		await pay('pi_a', 50_000, 'team-a')
		refundedInDashboard('pi_a', 50_000)

		const report = await reconcile()

		expect(report.corrected).toEqual([
			{ teamId: 'team-a', seasonId: SEASON, paymentIntentId: 'pi_a' },
		])
		expect((await entry('team-a', 'pi_a'))?.status).toBe('refunded')
		expect(await ledgerPaidCents(firestore, 'team-a', SEASON)).toBe(0)
	})

	it('reports a payment it could not check and carries on', async () => {
		await seedTeam('team-a')
		await pay('pi_a', 50_000, 'team-a')
		await pay('pi_b', 40_000, 'team-a')
		refundedInDashboard('pi_b', 40_000)
		failNext('retrieve', 'pi_a')

		const report = await reconcile()

		expect(report.failures).toEqual([
			expect.objectContaining({ paymentIntentId: 'pi_a' }),
		])
		expect((await entry('team-a', 'pi_b'))?.status).toBe('refunded')
	})

	it('throws as scheduled when anything failed', async () => {
		await seedTeam('team-a')
		await pay('pi_a', 50_000, 'team-a')
		failNext('retrieve', 'pi_a')

		await expect(
			manifest.reconcileTeamPaymentsDaily.run({
				scheduleTime: new Date().toISOString(),
			})
		).rejects.toThrow(/1 payment/)
	})
})

describe('refundTeamContribution', () => {
	const ADMIN = 'admin-1'
	const request = (data: Record<string, unknown> = {}, uid = ADMIN) => ({
		auth: authed(uid),
		data: {
			teamId: 'team-a',
			seasonId: SEASON,
			paymentIntentId: 'pi_a',
			reason: 'Test payment by an admin.',
			...data,
		},
	})
	const refund = (data: Record<string, unknown> = {}) =>
		(manifest.refundTeamContribution as Callable).run(
			request(data) as never
		) as Promise<unknown>
	const codeOf = (data: Record<string, unknown> = {}, uid = ADMIN) =>
		errorCodeFrom(manifest.refundTeamContribution, request(data, uid))

	beforeEach(async () => {
		await firestore
			.collection('players')
			.doc(ADMIN)
			.set({ admin: true, banned: false, email: 'a@example.com' })
		await firestore
			.collection('players')
			.doc('player-1')
			.set({ admin: false, banned: false, email: 'p@example.com' })
		await seedTeam('team-a')
		await pay('pi_a', 50_000, 'team-a')
	})

	it('refunds in full and records who did it and why', async () => {
		await expect(refund()).resolves.toEqual({ success: true })

		expect(stripeCalls()).toEqual(['refund pi_a 50000'])
		const refunded = await entry('team-a', 'pi_a')
		expect(refunded).toMatchObject({
			status: 'refunded',
			refundReason: 'Test payment by an admin.',
		})
		expect(refunded?.refundedBy.path).toBe(`players/${ADMIN}`)
		expect(refunded?.refundedAt).toBeDefined()
	})

	it('refunds what is left of a partly refunded payment', async () => {
		refundedInDashboard('pi_a', 20_000)
		await reconcileTeamPayments({ stripe: new FakeStripe() as never })

		await refund()

		expect(stripeCalls()).toEqual(['refund pi_a 30000'])
		expect((await entry('team-a', 'pi_a'))?.status).toBe('refunded')
	})

	it('refuses a non-admin', async () => {
		expect(await codeOf({}, 'player-1')).toBe('permission-denied')
		expect(stripeCalls()).toEqual([])
	})

	it('refuses a contribution already refunded', async () => {
		await refund()
		fakeStripe.calls.length = 0

		expect(await codeOf()).toBe('failed-precondition')
		expect(stripeCalls()).toEqual([])
	})

	it('reports a contribution that does not exist', async () => {
		expect(await codeOf({ paymentIntentId: 'pi_nope' })).toBe('not-found')
	})

	it.each([
		['no reason', { reason: undefined }],
		['a blank reason', { reason: '   ' }],
		['an overlong reason', { reason: 'x'.repeat(501) }],
		['no team', { teamId: '' }],
		['no payment id', { paymentIntentId: undefined }],
	])('refuses %s', async (_label, data) => {
		expect(await codeOf(data)).toBe('invalid-argument')
		expect(stripeCalls()).toEqual([])
	})

	it('corrects the record instead of refunding when Stripe disagrees', async () => {
		// The ledger says paid; Stripe says it was refunded in the Dashboard.
		// Refunding again would fail, and the admin needs to know what is
		// true.
		refundedInDashboard('pi_a', 50_000)

		expect(await codeOf()).toBe('failed-precondition')
		expect(stripeCalls()).toEqual([])
		expect((await entry('team-a', 'pi_a'))?.status).toBe('refunded')
		expect((await entry('team-a', 'pi_a'))?.refundReason).toBeUndefined()
	})

	it('leaves no audit trail for a refund Stripe refused', async () => {
		failNext('refund', 'pi_a')

		expect(await codeOf()).toBe('internal')
		const unchanged = await entry('team-a', 'pi_a')
		expect(unchanged?.status).toBe('paid')
		expect(unchanged?.refundedBy).toBeUndefined()
	})

	it('leaves the team registered when its money is refunded', async () => {
		// Registration is irreversible; the shortfall is for a person.
		await teamSeasonRef(firestore, 'team-a', SEASON).update({
			registered: true,
		})
		await seasonRef().update({ registeredTeamCount: LOCK })

		await refund()

		const teamSeason = (
			await teamSeasonRef(firestore, 'team-a', SEASON).get()
		).data()
		expect(teamSeason?.registered).toBe(true)
	})
})
