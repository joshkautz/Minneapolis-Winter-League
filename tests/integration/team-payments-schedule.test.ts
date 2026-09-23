import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	type Callable,
} from './helpers.js'
import {
	addHold,
	failNext,
	FakeStripe,
	fakeStripe,
	resetFakeStripe,
} from './fake-stripe.js'
import { TEAM_CONFIG } from '../../Functions/src/config/constants.js'
import {
	recordContribution,
	setContributionStatus,
	teamContributionsCollection,
} from '../../Functions/src/shared/contributions.js'
import { teamSeasonRef } from '../../Functions/src/shared/database.js'
import { sweepTeamPayments } from '../../Functions/src/services/teamPaymentsSweep.js'
import {
	LIVE_TEAM_HOLDS_QUERY,
	reconcileTeamPayments,
} from '../../Functions/src/services/teamPaymentsReconciliation.js'
import { EXPIRY_CAPTURE_MARGIN_MS } from '../../Functions/src/shared/settlement.js'

/**
 * The parts of settlement that run on a clock, and the admin's manual
 * release.
 *
 * Triggers settle a team when something happens to it. These cover what
 * happens because time passes — registration closing, a hold nearing expiry
 * — and what catches an event that was lost: the daily reconciliation
 * between Stripe and the ledger.
 */

vi.mock('stripe', async () => ({
	default: (await import('./fake-stripe.js')).FakeStripe,
}))

const TOTAL = 100_000
const LOCK = TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK
const SEASON = 'season-1'
const DAY_MS = 24 * 60 * 60 * 1000
const REGISTRATION_END = Date.now() + 10 * DAY_MS

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

/** A hold in Stripe and, unless told otherwise, in the ledger. */
const hold = async (
	paymentIntentId: string,
	amountCents: number,
	teamId: string,
	options: { expiresAt?: number; inLedger?: boolean; seasonId?: string } = {}
) => {
	const seasonId = options.seasonId ?? SEASON
	const intent = addHold(
		paymentIntentId,
		amountCents,
		metadataFor(teamId, seasonId),
		options.expiresAt === undefined
			? undefined
			: Math.floor(options.expiresAt / 1000)
	)
	if (options.inLedger === false) return
	await recordContribution(firestore, {
		teamId,
		seasonId,
		playerId: 'payer',
		paymentIntentId,
		amountCents,
		status: 'authorized',
		captureBefore: Timestamp.fromMillis(
			intent.latest_charge.payment_method_details.card.capture_before * 1000
		),
	})
}

const entry = async (teamId: string, paymentIntentId: string) =>
	(
		await teamContributionsCollection(firestore, teamId, SEASON)
			.doc(paymentIntentId)
			.get()
	).data()

const stripeCalls = () =>
	fakeStripe.calls.map((c) =>
		c.amount === undefined
			? `${c.method} ${c.paymentIntentId}`
			: `${c.method} ${c.paymentIntentId} ${c.amount}`
	)

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
	it('releases unregistered teams once registration closes', async () => {
		await seedTeam('team-a')
		await seedTeam('team-b')
		await hold('pi_a', 60_000, 'team-a')
		await hold('pi_b', 40_000, 'team-b')

		const result = await sweepTeamPayments({
			now: new Date(REGISTRATION_END + 1000),
		})

		expect(stripeCalls().sort()).toEqual(['cancel pi_a', 'cancel pi_b'])
		expect(result).toEqual({ teamsChecked: 2, teamsActedOn: 2, failures: [] })
	})

	it('does nothing to a fresh hold before registration closes', async () => {
		await seedTeam('team-a')
		await hold('pi_a', 60_000, 'team-a')

		await sweepTeamPayments()

		expect(stripeCalls()).toEqual([])
	})

	it('captures a hold in its last day rather than let it lapse', async () => {
		const expiresAt = Date.now() + 3 * DAY_MS
		await seedTeam('team-a')
		await hold('pi_expiring', 60_000, 'team-a', { expiresAt })
		await hold('pi_fresh', 40_000, 'team-a')

		await sweepTeamPayments({
			now: new Date(expiresAt - EXPIRY_CAPTURE_MARGIN_MS / 2),
		})

		expect(stripeCalls()).toEqual(['capture pi_expiring 60000'])
	})

	it('keeps the registered teams’ money after registration closes', async () => {
		await seedTeam('team-a', true)
		await seasonRef().update({ registeredTeamCount: 1 })
		await hold('pi_a', TOTAL, 'team-a')

		await sweepTeamPayments({ now: new Date(REGISTRATION_END + 1000) })

		expect(stripeCalls()).toEqual(['capture pi_a 100000'])
	})

	it('releases a hold that reached a covered team without being settled', async () => {
		// The trigger that would have released it was lost.
		await seedTeam('team-a', true)
		await seasonRef().update({ registeredTeamCount: 1 })
		await hold('pi_a', TOTAL, 'team-a')
		await setContributionStatus(firestore, {
			teamId: 'team-a',
			seasonId: SEASON,
			paymentIntentId: 'pi_a',
			status: 'captured',
		})
		fakeStripe.intents.get('pi_a')!.status = 'succeeded'
		fakeStripe.intents.get('pi_a')!.amount_received = TOTAL
		await hold('pi_late', 20_000, 'team-a')

		await sweepTeamPayments()

		expect(stripeCalls()).toEqual(['cancel pi_late'])
	})

	it('skips teams that hold no money', async () => {
		await seedTeam('team-a')
		await seedTeam('team-b')

		expect(await sweepTeamPayments()).toEqual({
			teamsChecked: 0,
			teamsActedOn: 0,
			failures: [],
		})
	})

	it('ignores a season on per-player pricing', async () => {
		await seedSeason('season-old', { teamRegistrationTotalCents: null })
		await seedTeam('team-old', false, 'season-old')
		await hold('pi_old', 50_000, 'team-old', { seasonId: 'season-old' })

		const result = await sweepTeamPayments({
			now: new Date(REGISTRATION_END + 1000),
		})

		expect(result.teamsChecked).toBe(0)
		expect(stripeCalls()).toEqual([])
	})

	it('covers every season on team payments, not just the current one', async () => {
		// A hold from last season is still money, whichever season is newest.
		await seedSeason('season-2', {
			dateStart: Timestamp.fromMillis(Date.now() + DAY_MS),
		})
		await seedTeam('team-a')
		await hold('pi_a', 50_000, 'team-a')

		await sweepTeamPayments({ now: new Date(REGISTRATION_END + 1000) })

		expect(stripeCalls()).toEqual(['cancel pi_a'])
	})

	it('settles the other teams when one fails', async () => {
		await seedTeam('team-a')
		await seedTeam('team-b')
		await hold('pi_a', 60_000, 'team-a')
		await hold('pi_b', 40_000, 'team-b')
		failNext('cancel', 'pi_a')

		const result = await sweepTeamPayments({
			now: new Date(REGISTRATION_END + 1000),
		})

		expect(stripeCalls()).toEqual(['cancel pi_b'])
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
			// Registration has closed, so any unregistered money is released.
			await seasonRef().update({
				registrationEnd: Timestamp.fromMillis(Date.now() - 1000),
			})
			await seedTeam('team-a')
			await hold('pi_a', 60_000, 'team-a')
		})

		it('runs the sweep', async () => {
			await run()
			expect(stripeCalls()).toEqual(['cancel pi_a'])
		})

		it('throws when a team could not be settled, so the failure is seen', async () => {
			failNext('cancel', 'pi_a')
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
	const reconcile = () =>
		reconcileTeamPayments({ stripe: new FakeStripe() as never })

	it('asks Stripe for live team holds and nothing else', async () => {
		await reconcile()
		expect(fakeStripe.searches).toEqual([LIVE_TEAM_HOLDS_QUERY])
		expect(LIVE_TEAM_HOLDS_QUERY).toBe(
			"status:'requires_capture' AND metadata['kind']:'team_contribution'"
		)
	})

	it('records a hold the webhook never delivered', async () => {
		// Otherwise the money is invisible: the team is not credited with it,
		// and nothing would ever capture or release it.
		await seedTeam('team-a')
		await hold('pi_lost', 50_000, 'team-a', { inLedger: false })

		const report = await reconcile()

		expect(report.unrecordedHolds).toEqual([
			{ paymentIntentId: 'pi_lost', outcome: 'recorded' },
		])
		expect(await entry('team-a', 'pi_lost')).toMatchObject({
			status: 'authorized',
			amountCents: 50_000,
		})
	})

	it('records the hold’s real expiry, not a guess', async () => {
		const expiresAt = Date.now() + 4 * DAY_MS
		await seedTeam('team-a')
		await hold('pi_lost', 50_000, 'team-a', { expiresAt, inLedger: false })

		await reconcile()

		expect((await entry('team-a', 'pi_lost'))?.captureBefore.toMillis()).toBe(
			Math.floor(expiresAt / 1000) * 1000
		)
	})

	it('releases a lost hold whose team no longer exists', async () => {
		await hold('pi_orphan', 50_000, 'team-gone', { inLedger: false })

		const report = await reconcile()

		expect(report.unrecordedHolds).toEqual([
			{ paymentIntentId: 'pi_orphan', outcome: 'released-unattributable' },
		])
		expect(stripeCalls()).toEqual(['cancel pi_orphan'])
	})

	it('leaves holds the ledger already has alone', async () => {
		await seedTeam('team-a')
		await hold('pi_a', 50_000, 'team-a')

		const report = await reconcile()

		expect(report).toEqual({ unrecordedHolds: [], corrected: [], failures: [] })
		expect(stripeCalls()).toEqual([])
	})

	it('corrects a hold the bank let go, so it stops counting', async () => {
		// Registration counts committed money. A lapsed hold that the ledger
		// still called authorized would count toward a team's total.
		await seedTeam('team-a')
		await hold('pi_a', 50_000, 'team-a')
		fakeStripe.intents.get('pi_a')!.status = 'canceled'

		const report = await reconcile()

		expect(report.corrected).toEqual([
			{ teamId: 'team-a', seasonId: SEASON, paymentIntentId: 'pi_a' },
		])
		expect((await entry('team-a', 'pi_a'))?.status).toBe('canceled')
		const teamSeason = (
			await teamSeasonRef(firestore, 'team-a', SEASON).get()
		).data()
		expect(teamSeason?.authorizedCents).toBe(0)
	})

	it('corrects a refund issued in the Dashboard', async () => {
		await seedTeam('team-a', true)
		await hold('pi_a', 50_000, 'team-a')
		await setContributionStatus(firestore, {
			teamId: 'team-a',
			seasonId: SEASON,
			paymentIntentId: 'pi_a',
			status: 'captured',
		})
		const pi = fakeStripe.intents.get('pi_a')!
		pi.status = 'succeeded'
		pi.amount_received = 50_000
		pi.latest_charge.amount_refunded = 50_000

		await reconcile()

		expect((await entry('team-a', 'pi_a'))?.status).toBe('refunded')
	})

	it('reports a payment it could not check and carries on', async () => {
		await seedTeam('team-a')
		await hold('pi_a', 50_000, 'team-a')
		await hold('pi_b', 40_000, 'team-a')
		fakeStripe.intents.get('pi_b')!.status = 'canceled'
		failNext('retrieve', 'pi_a')

		const report = await reconcile()

		expect(report.failures).toEqual([
			expect.objectContaining({ paymentIntentId: 'pi_a' }),
		])
		expect((await entry('team-a', 'pi_b'))?.status).toBe('canceled')
	})

	it('throws as scheduled when anything failed', async () => {
		await seedTeam('team-a')
		await hold('pi_a', 50_000, 'team-a')
		failNext('retrieve', 'pi_a')

		await expect(
			manifest.reconcileTeamPaymentsDaily.run({
				scheduleTime: new Date().toISOString(),
			})
		).rejects.toThrow(/1 payment/)
	})
})

describe('releaseTeamContribution', () => {
	const ADMIN = 'admin-1'
	const release = (data: Record<string, unknown> = {}, uid = ADMIN) =>
		(manifest.releaseTeamContribution as Callable).run({
			auth: authed(uid),
			data: {
				teamId: 'team-a',
				seasonId: SEASON,
				paymentIntentId: 'pi_a',
				reason: 'Payer left the team before it registered.',
				...data,
			},
		} as never) as Promise<{ status: string }>
	const codeOf = (data: Record<string, unknown> = {}, uid = ADMIN) =>
		errorCodeFrom(manifest.releaseTeamContribution, {
			auth: authed(uid),
			data: {
				teamId: 'team-a',
				seasonId: SEASON,
				paymentIntentId: 'pi_a',
				reason: 'Payer left the team before it registered.',
				...data,
			},
		})

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
		await hold('pi_a', 50_000, 'team-a')
	})

	it('cancels a hold and records who released it and why', async () => {
		await expect(release()).resolves.toEqual({
			success: true,
			status: 'canceled',
		})

		expect(stripeCalls()).toEqual(['cancel pi_a'])
		const released = await entry('team-a', 'pi_a')
		expect(released).toMatchObject({
			status: 'canceled',
			releaseReason: 'Payer left the team before it registered.',
		})
		expect(released?.releasedBy.path).toBe(`players/${ADMIN}`)
		expect(released?.releasedAt).toBeDefined()
	})

	it('refunds a captured contribution', async () => {
		await setContributionStatus(firestore, {
			teamId: 'team-a',
			seasonId: SEASON,
			paymentIntentId: 'pi_a',
			status: 'captured',
		})
		const pi = fakeStripe.intents.get('pi_a')!
		pi.status = 'succeeded'
		pi.amount_received = 50_000
		pi.amount_capturable = 0

		await expect(release()).resolves.toEqual({
			success: true,
			status: 'refunded',
		})
		expect(stripeCalls()).toEqual(['refund pi_a 50000'])
	})

	it('refuses a non-admin', async () => {
		expect(await codeOf({}, 'player-1')).toBe('permission-denied')
		expect(stripeCalls()).toEqual([])
	})

	it('refuses a contribution already settled', async () => {
		// Settled on both sides, as it would be.
		await setContributionStatus(firestore, {
			teamId: 'team-a',
			seasonId: SEASON,
			paymentIntentId: 'pi_a',
			status: 'canceled',
		})
		fakeStripe.intents.get('pi_a')!.status = 'canceled'

		expect(await codeOf()).toBe('failed-precondition')
		expect((await entry('team-a', 'pi_a'))?.releasedBy).toBeUndefined()
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

	it('corrects the record instead of acting when Stripe disagrees', async () => {
		// The ledger says captured; Stripe says the hold was cancelled. A
		// refund would fail, and the admin needs to know what is true.
		await setContributionStatus(firestore, {
			teamId: 'team-a',
			seasonId: SEASON,
			paymentIntentId: 'pi_a',
			status: 'captured',
		})
		fakeStripe.intents.get('pi_a')!.status = 'canceled'

		expect(await codeOf()).toBe('failed-precondition')
		expect(stripeCalls()).toEqual([])
		expect((await entry('team-a', 'pi_a'))?.status).toBe('canceled')
		expect((await entry('team-a', 'pi_a'))?.releaseReason).toBeUndefined()
	})

	it('leaves no audit trail for a release Stripe refused', async () => {
		failNext('cancel', 'pi_a')

		expect(await codeOf()).toBe('internal')
		const unchanged = await entry('team-a', 'pi_a')
		expect(unchanged?.status).toBe('authorized')
		expect(unchanged?.releasedBy).toBeUndefined()
	})

	it('leaves the team registered when its money is released', async () => {
		// Registration is irreversible; the shortfall is for a person.
		await teamSeasonRef(firestore, 'team-a', SEASON).update({
			registered: true,
		})
		await seasonRef().update({ registeredTeamCount: LOCK })

		await release()

		const teamSeason = (
			await teamSeasonRef(firestore, 'team-a', SEASON).get()
		).data()
		expect(teamSeason?.registered).toBe(true)
	})
})
