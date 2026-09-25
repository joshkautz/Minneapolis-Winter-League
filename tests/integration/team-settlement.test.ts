import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { Request, Response } from 'firebase-functions/v2/https'
import { initTestApp, resetFirestore, ledgerTotals } from './helpers.js'
import {
	addHold,
	failNext,
	fakeStripe,
	gateRetrieves,
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
import {
	SettlementIncompleteError,
	settleTeamSeason,
} from '../../Functions/src/services/teamSettlementService.js'
import { EXPIRY_CAPTURE_MARGIN_MS } from '../../Functions/src/shared/settlement.js'

/**
 * Settlement against a Stripe that keeps state.
 *
 * `settlement.test.ts` covers every decision; this covers carrying them out.
 * The fake enforces what the real API does — a cancelled hold cannot be
 * captured, a refund cannot exceed what was taken, a repeated idempotency
 * key replays — so these tests catch the executor acting on stale state,
 * double-charging under concurrency, or recording what it asked for instead
 * of what happened.
 */

vi.mock('stripe', async () => ({
	default: (await import('./fake-stripe.js')).FakeStripe,
}))

const TOTAL = 100_000
const LOCK = TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK
const SEASON = 'season-1'
const TEAM = 'team-1'
const DAY_MS = 24 * 60 * 60 * 1000

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const seasonRef = () => firestore.collection('seasons').doc(SEASON)

const seedSeason = async (overrides: Record<string, unknown> = {}) => {
	await seasonRef().set({
		name: '2030 Winter',
		dateStart: Timestamp.now(),
		registrationStart: Timestamp.fromMillis(Date.now() - DAY_MS),
		registrationEnd: Timestamp.fromMillis(Date.now() + 10 * DAY_MS),
		registeredTeamCount: 0,
		teamRegistrationTotalCents: TOTAL,
		...overrides,
	})
}

const seedTeam = async (teamId: string, registered: boolean) => {
	await firestore.collection('teams').doc(teamId).set({ teamId })
	await teamSeasonRef(firestore, teamId, SEASON).set({
		season: seasonRef(),
		name: teamId,
		logo: null,
		storagePath: null,
		placement: null,
		registered,
		registeredDate: registered ? Timestamp.now() : null,
	} as never)
}

const metadataFor = (teamId: string) => ({
	kind: 'team_contribution',
	firebaseUID: 'payer',
	teamId,
	seasonId: SEASON,
})

/** A hold in Stripe and in the ledger, as the checkout webhook leaves it. */
const hold = async (
	paymentIntentId: string,
	amountCents: number,
	teamId = TEAM,
	captureBeforeSeconds?: number
) => {
	const intent = addHold(
		paymentIntentId,
		amountCents,
		metadataFor(teamId),
		captureBeforeSeconds
	)
	// The payer is on the team: money from someone who has left is
	// released, which the leaver tests cover.
	await teamRosterEntryRef(firestore, teamId, SEASON, 'payer').set({
		player: firestore.collection('players').doc('payer'),
		dateJoined: Timestamp.now(),
	})
	await recordContribution(firestore, {
		teamId,
		seasonId: SEASON,
		playerId: 'payer',
		paymentIntentId,
		amountCents,
		status: 'authorized',
		captureBefore: Timestamp.fromMillis(
			intent.latest_charge.payment_method_details.card.capture_before * 1000
		),
	})
}

const ledger = async (teamId = TEAM) => {
	const snap = await teamContributionsCollection(
		firestore,
		teamId,
		SEASON
	).get()
	return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))
}

const totals = (teamId = TEAM) => ledgerTotals(firestore, teamId, SEASON)

const stripeCalls = () =>
	fakeStripe.calls.map((c) =>
		c.amount === undefined
			? `${c.method} ${c.paymentIntentId}`
			: `${c.method} ${c.paymentIntentId} ${c.amount}`
	)

const settle = (teamId = TEAM, now?: Date) =>
	settleTeamSeason(teamId, SEASON, now ? { now } : {})

beforeAll(async () => {
	process.env.STRIPE_SECRET_KEY ??= 'sk_test_integration'
	process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_integration'
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

describe('a registered team', () => {
	beforeEach(async () => {
		await seedTeam(TEAM, true)
		await seasonRef().update({ registeredTeamCount: 1 })
	})

	it('has its hold captured in full', async () => {
		await hold('pi_1', TOTAL)

		await settle()

		expect(stripeCalls()).toEqual(['capture pi_1 100000'])
		expect((await ledger()).pi_1).toMatchObject({
			status: 'captured',
			amountCents: TOTAL,
		})
		expect(await totals()).toEqual({ authorizedCents: 0, capturedCents: TOTAL })
	})

	it('is charged exactly the total when it overpaid', async () => {
		// Three teammates raced for the last few hundred dollars.
		await hold('pi_1', 60_000)
		await hold('pi_2', 50_000)
		await hold('pi_3', 20_000)

		await settle()

		expect(stripeCalls()).toEqual([
			'capture pi_1 60000',
			'capture pi_2 40000',
			'cancel pi_3',
		])
		const entries = await ledger()
		expect(entries.pi_2).toMatchObject({
			status: 'captured',
			amountCents: 40_000,
			// What the payer committed is still on record.
			authorizedAmountCents: 50_000,
		})
		expect(entries.pi_3.status).toBe('canceled')
		expect(await totals()).toEqual({ authorizedCents: 0, capturedCents: TOTAL })
	})

	it('changes nothing when settled again', async () => {
		await hold('pi_1', 60_000)
		await hold('pi_2', 50_000)
		await settle()
		const after = stripeCalls()

		await expect(settle()).resolves.toMatchObject({ actionsApplied: 0 })
		expect(stripeCalls()).toEqual(after)
	})

	it('is not double-charged when two settlements race', async () => {
		// The registration trigger and the contribution trigger can both
		// settle the same team at the same moment.
		await hold('pi_1', 60_000)
		await hold('pi_2', 50_000)

		// Every one succeeds: the idempotency keys make the losers of the
		// race replay the winner's capture instead of failing on it. The
		// gate makes all three read the hold before any captures it.
		gateRetrieves('pi_1', 3)
		const results = await Promise.allSettled([settle(), settle(), settle()])
		expect(results.map((r) => r.status)).toEqual([
			'fulfilled',
			'fulfilled',
			'fulfilled',
		])

		const captured = [...fakeStripe.intents.values()].reduce(
			(sum, pi) => sum + pi.amount_received,
			0
		)
		expect(captured).toBe(TOTAL)
		expect(await totals()).toEqual({ authorizedCents: 0, capturedCents: TOTAL })
	})

	it('finishes on retry after Stripe fails part-way', async () => {
		await hold('pi_1', 40_000)
		await hold('pi_2', 40_000)
		await hold('pi_3', 40_000)
		failNext('capture', 'pi_2')

		const error = await settle().catch((e: unknown) => e)
		expect(error).toBeInstanceOf(SettlementIncompleteError)
		// The failure did not stop the rest.
		expect(stripeCalls()).toEqual(['capture pi_1 40000', 'capture pi_3 20000'])

		await settle()

		const entries = await ledger()
		expect(entries.pi_2).toMatchObject({
			status: 'captured',
			amountCents: 40_000,
		})
		expect(await totals()).toEqual({ authorizedCents: 0, capturedCents: TOTAL })
	})

	it('records a hold cancelled outside this code instead of acting on it', async () => {
		// Released by the bank or in the Dashboard. Settlement must not try
		// to capture it, and the ledger has to stop counting it.
		await hold('pi_1', TOTAL)
		fakeStripe.intents.get('pi_1')!.status = 'canceled'

		const outcome = await settle()

		expect(stripeCalls()).toEqual([])
		expect((await ledger()).pi_1.status).toBe('canceled')
		expect(outcome).toMatchObject({ shortfallCents: 0 })
		// The next settlement sees the shortfall that left behind.
		await expect(settle()).resolves.toMatchObject({ shortfallCents: TOTAL })
	})
})

describe('an unregistered team', () => {
	beforeEach(async () => {
		await seedTeam(TEAM, false)
	})

	it('keeps its holds while it is still in the running', async () => {
		await hold('pi_1', 60_000)

		await expect(settle()).resolves.toMatchObject({ disposition: 'hold' })
		expect(stripeCalls()).toEqual([])
	})

	it('has a hold captured before it expires, rather than let it lapse', async () => {
		const expiresAt = Date.now() + 3 * DAY_MS
		await hold('pi_1', 60_000, TEAM, Math.floor(expiresAt / 1000))

		await settle(TEAM, new Date(expiresAt - EXPIRY_CAPTURE_MARGIN_MS / 2))

		expect(stripeCalls()).toEqual(['capture pi_1 60000'])
	})

	it('is released for free once every spot is taken', async () => {
		await seasonRef().update({ registeredTeamCount: LOCK })
		await hold('pi_1', 60_000)
		await hold('pi_2', 40_000)

		await settle()

		expect(stripeCalls()).toEqual(['cancel pi_1', 'cancel pi_2'])
		expect(await totals()).toEqual({ authorizedCents: 0, capturedCents: 0 })
	})

	it('records a hold the bank already released instead of cancelling it', async () => {
		await seasonRef().update({ registeredTeamCount: LOCK })
		await hold('pi_1', 60_000)
		await hold('pi_2', 40_000)
		fakeStripe.intents.get('pi_1')!.status = 'canceled'

		await settle()

		// Cancelling an already-cancelled PaymentIntent is an error in Stripe.
		expect(stripeCalls()).toEqual(['cancel pi_2'])
		expect((await ledger()).pi_1.status).toBe('canceled')
		expect(await totals()).toEqual({ authorizedCents: 0, capturedCents: 0 })
	})

	it('is released once registration closes', async () => {
		await hold('pi_1', 60_000)

		await settle(TEAM, new Date(Date.now() + 11 * DAY_MS))

		expect(stripeCalls()).toEqual(['cancel pi_1'])
	})

	it('is refunded what the expiry net captured when it misses out', async () => {
		const expiresAt = Date.now() + 3 * DAY_MS
		await hold('pi_1', 60_000, TEAM, Math.floor(expiresAt / 1000))
		await hold('pi_2', 40_000)
		await settle(TEAM, new Date(expiresAt - 1000))
		expect((await ledger()).pi_1.status).toBe('captured')

		await seasonRef().update({ registeredTeamCount: LOCK })
		await settle()

		expect(stripeCalls()).toEqual([
			'capture pi_1 60000',
			'refund pi_1 60000',
			'cancel pi_2',
		])
		const entries = await ledger()
		expect(entries.pi_1.status).toBe('refunded')
		expect(await totals()).toEqual({ authorizedCents: 0, capturedCents: 0 })
	})
})

it('leaves a season on per-player pricing alone', async () => {
	await seedSeason({ teamRegistrationTotalCents: null })
	await seedTeam(TEAM, true)
	await hold('pi_1', TOTAL)

	await expect(settle()).resolves.toEqual({ outcome: 'not-team-payments' })
	expect(stripeCalls()).toEqual([])
})

describe('onTeamRegistrationChange', () => {
	const fire = (teamId: string) =>
		manifest.onTeamRegistrationChange.run({
			id: 'evt-1',
			params: { teamId, seasonId: SEASON },
			data: {
				before: { exists: true, data: () => ({ registered: false }) },
				after: { exists: true, data: () => ({ registered: true }) },
			},
		})

	it('captures the money of the team that just registered', async () => {
		await seedTeam(TEAM, true)
		await seasonRef().update({ registeredTeamCount: 1 })
		await hold('pi_1', TOTAL)

		await fire(TEAM)

		expect(stripeCalls()).toEqual(['capture pi_1 100000'])
	})

	describe('the twelfth registration', () => {
		beforeEach(async () => {
			for (let i = 1; i < LOCK; i++) await seedTeam(`reg-${i}`, true)
			await seedTeam(TEAM, true)
			await seasonRef().update({ registeredTeamCount: LOCK })
			await hold('pi_winner', TOTAL)

			await seedTeam('loser-a', false)
			await seedTeam('loser-b', false)
			await hold('pi_a1', 60_000, 'loser-a')
			await hold('pi_a2', 40_000, 'loser-a')
			await hold('pi_b1', 30_000, 'loser-b')
		})

		it('releases every team that missed out, then removes it', async () => {
			await fire(TEAM)

			expect(stripeCalls().sort()).toEqual(
				[
					'capture pi_winner 100000',
					'cancel pi_a1',
					'cancel pi_a2',
					'cancel pi_b1',
				].sort()
			)
			expect(
				(await teamSeasonRef(firestore, 'loser-a', SEASON).get()).exists
			).toBe(false)
			expect(
				(await teamSeasonRef(firestore, 'loser-b', SEASON).get()).exists
			).toBe(false)
		})

		it('keeps the record of what was released after the team is gone', async () => {
			await fire(TEAM)

			const entries = await ledger('loser-a')
			expect(entries.pi_a1.status).toBe('canceled')
			expect(entries.pi_a2.status).toBe('canceled')
		})

		it('keeps a team whose money could not be released, and retries', async () => {
			// Deleting it would lose track of a live hold.
			failNext('cancel', 'pi_b1')

			await expect(fire(TEAM)).rejects.toThrow(/loser-b/)
			expect(
				(await teamSeasonRef(firestore, 'loser-b', SEASON).get()).exists
			).toBe(true)
			expect(
				(await teamSeasonRef(firestore, 'loser-a', SEASON).get()).exists
			).toBe(false)

			// The platform's retry finishes the job.
			await fire(TEAM)
			expect(
				(await teamSeasonRef(firestore, 'loser-b', SEASON).get()).exists
			).toBe(false)
			expect((await ledger('loser-b')).pi_b1.status).toBe('canceled')
		})
	})
})

describe('updateTeamRegistrationOnContributionChange', () => {
	const fire = (paymentIntentId: string, teamId = TEAM) =>
		ledger(teamId).then((entries) =>
			manifest.updateTeamRegistrationOnContributionChange.run({
				id: 'evt-1',
				params: { teamId, seasonId: SEASON, paymentIntentId },
				data: {
					before: { exists: false, data: () => undefined },
					after: { exists: true, data: () => entries[paymentIntentId] },
				},
			})
		)

	it('releases a hold that lands after its team was covered', async () => {
		// A teammate paid while the capture was under way.
		await seedTeam(TEAM, true)
		await seasonRef().update({ registeredTeamCount: 1 })
		await hold('pi_1', TOTAL)
		await settle()

		await hold('pi_late', 20_000)
		await fire('pi_late')

		expect(stripeCalls()).toEqual(['capture pi_1 100000', 'cancel pi_late'])
	})

	it('releases a hold that lands after the season filled', async () => {
		await seedTeam(TEAM, false)
		await seasonRef().update({ registeredTeamCount: LOCK })
		await hold('pi_1', 50_000)

		await fire('pi_1')

		expect(stripeCalls()).toEqual(['cancel pi_1'])
	})

	it('leaves a fresh hold alone on a team still in the running', async () => {
		await seedTeam(TEAM, false)
		await hold('pi_1', 50_000)

		await fire('pi_1')

		expect(stripeCalls()).toEqual([])
	})

	it('does not settle again for a change settlement made itself', async () => {
		await seedTeam(TEAM, true)
		await seasonRef().update({ registeredTeamCount: LOCK })
		await hold('pi_1', TOTAL)
		await settle()
		// Something a settlement would act on, were it to run.
		await hold('pi_late', 20_000)
		fakeStripe.calls.length = 0

		// pi_1's change to captured fires the trigger; it must not settle.
		await fire('pi_1')

		expect(stripeCalls()).toEqual([])
	})
})

describe('stripeWebhook reconciles changes made outside settlement', () => {
	const deliver = async (event: unknown) => {
		fakeStripe.nextEvent = event
		const res: Record<string, unknown> = {}
		res.status = vi.fn((code: number) => {
			res.statusCode = code
			return res
		})
		res.send = vi.fn(() => res)
		res.json = vi.fn(() => res)
		await (
			manifest.stripeWebhook as unknown as (
				req: Request,
				resp: Response
			) => Promise<void>
		)(
			{
				method: 'POST',
				headers: { 'stripe-signature': 't=1,v1=sig' },
				rawBody: Buffer.from('{}'),
			} as unknown as Request,
			res as unknown as Response
		)
		return res.statusCode ?? 200
	}

	beforeEach(async () => {
		await seedTeam(TEAM, false)
	})

	it('records a hold cancelled in the Dashboard', async () => {
		await hold('pi_1', 60_000)
		fakeStripe.intents.get('pi_1')!.status = 'canceled'

		expect(
			await deliver({
				id: 'evt_1',
				type: 'payment_intent.canceled',
				data: { object: { id: 'pi_1' } },
			})
		).toBe(200)

		expect((await ledger()).pi_1.status).toBe('canceled')
		expect(await totals()).toEqual({ authorizedCents: 0, capturedCents: 0 })
	})

	it('records a refund issued in the Dashboard', async () => {
		await hold('pi_1', 60_000)
		const pi = fakeStripe.intents.get('pi_1')!
		pi.status = 'succeeded'
		pi.amount_received = 60_000
		pi.amount_capturable = 0
		pi.latest_charge.amount_refunded = 60_000

		await deliver({
			id: 'evt_2',
			type: 'charge.refunded',
			data: { object: { id: 'ch_pi_1', payment_intent: 'pi_1' } },
		})

		expect((await ledger()).pi_1.status).toBe('refunded')
	})

	it('records a partial refund as a smaller capture', async () => {
		await hold('pi_1', 60_000)
		const pi = fakeStripe.intents.get('pi_1')!
		pi.status = 'succeeded'
		pi.amount_received = 60_000
		pi.amount_capturable = 0
		pi.latest_charge.amount_refunded = 10_000

		await deliver({
			id: 'evt_3',
			type: 'charge.refunded',
			data: { object: { id: 'ch_pi_1', payment_intent: 'pi_1' } },
		})

		expect((await ledger()).pi_1).toMatchObject({
			status: 'captured',
			amountCents: 50_000,
		})
	})

	it('ignores a per-player payment', async () => {
		addHold('pi_player', 10_000, { firebaseUID: 'someone' })

		expect(
			await deliver({
				id: 'evt_4',
				type: 'payment_intent.succeeded',
				data: { object: { id: 'pi_player' } },
			})
		).toBe(200)
		expect(await ledger()).toEqual({})
	})

	it('acknowledges an event for a contribution not yet recorded', async () => {
		// The PaymentIntent event outran the checkout completion. That
		// completion reads Stripe fresh, so nothing is lost by skipping.
		addHold('pi_early', 10_000, metadataFor(TEAM))

		expect(
			await deliver({
				id: 'evt_5',
				type: 'payment_intent.canceled',
				data: { object: { id: 'pi_early' } },
			})
		).toBe(200)
		expect(await ledger()).toEqual({})
	})
})
