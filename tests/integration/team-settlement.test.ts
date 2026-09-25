import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { Request, Response } from 'firebase-functions/v2/https'
import { initTestApp, resetFirestore, ledgerPaidCents } from './helpers.js'
import {
	addPayment,
	failNext,
	fakeStripe,
	gateRetrieves,
	resetFakeStripe,
} from './fake-stripe.js'
import { TEAM_CONFIG } from '../../Functions/src/config/constants.js'
import {
	recordContribution,
	setContributionStatus,
	teamContributionsCollection,
} from '../../Functions/src/shared/contributions.js'
import {
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'
import { openCheckoutsRef } from '../../Functions/src/shared/checkoutReservations.js'
import {
	SettlementIncompleteError,
	settleTeamSeason,
} from '../../Functions/src/services/teamSettlementService.js'

/**
 * Settlement against a Stripe that keeps state.
 *
 * `settlement.test.ts` covers every decision; this covers carrying them out.
 * The fake enforces what the real API does — a refund cannot exceed what is
 * left, a repeated idempotency key replays — so these tests catch the
 * executor acting on stale state, refunding twice under concurrency, or
 * recording what it asked for instead of what happened.
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

/** A payment in Stripe and in the ledger, as the checkout webhook leaves it. */
const pay = async (
	paymentIntentId: string,
	amountCents: number,
	teamId = TEAM
) => {
	addPayment(paymentIntentId, amountCents, metadataFor(teamId))
	// The payer is on the team: money from someone who has left is refunded,
	// which the leaver tests cover.
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

const held = (teamId = TEAM) => ledgerPaidCents(firestore, teamId, SEASON)

const stripeCalls = () =>
	fakeStripe.calls
		.filter((c) => c.method === 'refund')
		.map((c) => `${c.method} ${c.paymentIntentId} ${c.amount}`)

/** What Stripe still holds across every payment, less refunds. */
const stripeHolds = () =>
	[...fakeStripe.intents.values()].reduce(
		(sum, pi) => sum + pi.amount_received - pi.latest_charge.amount_refunded,
		0
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

	it('keeps exactly its total', async () => {
		await pay('pi_1', TOTAL)

		await expect(settle()).resolves.toMatchObject({ actionsApplied: 0 })
		expect(stripeCalls()).toEqual([])
		expect(await held()).toBe(TOTAL)
	})

	it('is refunded what it paid over the total, latest payments first', async () => {
		// Three teammates raced for the last few hundred dollars.
		await pay('pi_1', 60_000)
		await pay('pi_2', 50_000)
		await pay('pi_3', 20_000)

		await settle()

		expect(stripeCalls()).toEqual(['refund pi_2 10000', 'refund pi_3 20000'])
		const entries = await ledger()
		expect(entries.pi_2).toMatchObject({
			status: 'paid',
			amountCents: 40_000,
			// What the payer put in is still on record.
			paidAmountCents: 50_000,
		})
		expect(entries.pi_3.status).toBe('refunded')
		expect(await held()).toBe(TOTAL)
		expect(stripeHolds()).toBe(TOTAL)
	})

	it('changes nothing when settled again', async () => {
		await pay('pi_1', 60_000)
		await pay('pi_2', 50_000)
		await settle()
		const after = stripeCalls()

		await expect(settle()).resolves.toMatchObject({ actionsApplied: 0 })
		expect(stripeCalls()).toEqual(after)
	})

	it('is not refunded twice when two settlements race', async () => {
		// The registration trigger and the contribution trigger can both
		// settle the same team at the same moment.
		await pay('pi_1', 60_000)
		await pay('pi_2', 50_000)

		// Every one succeeds: the idempotency keys make the losers of the
		// race replay the winner's refund instead of issuing another. The
		// gate makes all three read the payment before any refunds it.
		gateRetrieves('pi_2', 3)
		const results = await Promise.allSettled([settle(), settle(), settle()])
		expect(results.map((r) => r.status)).toEqual([
			'fulfilled',
			'fulfilled',
			'fulfilled',
		])

		expect(stripeHolds()).toBe(TOTAL)
		expect(await held()).toBe(TOTAL)
	})

	it('finishes on retry after Stripe fails part-way', async () => {
		await pay('pi_1', 70_000)
		await pay('pi_2', 40_000)
		await pay('pi_3', 30_000)
		failNext('refund', 'pi_2')

		const error = await settle().catch((e: unknown) => e)
		expect(error).toBeInstanceOf(SettlementIncompleteError)
		// The failure did not stop the rest.
		expect(stripeCalls()).toEqual(['refund pi_3 30000'])

		await settle()

		expect(stripeCalls()).toEqual(['refund pi_3 30000', 'refund pi_2 10000'])
		expect(await held()).toBe(TOTAL)
	})

	it('records a refund issued outside this code instead of repeating it', async () => {
		// Refunded in the Dashboard before settlement ran. Settlement must not
		// refund it again, and the ledger has to stop counting it.
		await pay('pi_1', TOTAL)
		await pay('pi_2', 20_000)
		fakeStripe.intents.get('pi_2')!.latest_charge.amount_refunded = 20_000

		await settle()

		expect(stripeCalls()).toEqual([])
		expect((await ledger()).pi_2.status).toBe('refunded')
		expect(await held()).toBe(TOTAL)
	})

	it('reports a shortfall when its money was refunded out from under it', async () => {
		// Refunded in the Dashboard; the refund webhook records it.
		await pay('pi_1', TOTAL)
		await setContributionStatus(firestore, {
			teamId: TEAM,
			seasonId: SEASON,
			paymentIntentId: 'pi_1',
			status: 'refunded',
		})

		// Registration stands; the shortfall is for a person to chase.
		await expect(settle()).resolves.toMatchObject({ shortfallCents: TOTAL })
		expect(stripeCalls()).toEqual([])
	})
})

describe('an unregistered team', () => {
	beforeEach(async () => {
		await seedTeam(TEAM, false)
	})

	it('keeps its money while it is still in the running', async () => {
		await pay('pi_1', 60_000)

		await expect(settle()).resolves.toMatchObject({ disposition: 'pending' })
		expect(stripeCalls()).toEqual([])
	})

	it('is refunded in full once every spot is taken', async () => {
		await seasonRef().update({ registeredTeamCount: LOCK })
		await pay('pi_1', 60_000)
		await pay('pi_2', 40_000)

		await settle()

		expect(stripeCalls()).toEqual(['refund pi_1 60000', 'refund pi_2 40000'])
		expect(await held()).toBe(0)
		expect(stripeHolds()).toBe(0)
	})

	it('is refunded once registration closes', async () => {
		await pay('pi_1', 60_000)

		await settle(TEAM, new Date(Date.now() + 11 * DAY_MS))

		expect(stripeCalls()).toEqual(['refund pi_1 60000'])
	})

	it('is refunded only what is left of a payment partly refunded already', async () => {
		await seasonRef().update({ registeredTeamCount: LOCK })
		await pay('pi_1', 60_000)
		fakeStripe.intents.get('pi_1')!.latest_charge.amount_refunded = 20_000

		await settle()

		expect(stripeCalls()).toEqual(['refund pi_1 40000'])
		expect((await ledger()).pi_1.status).toBe('refunded')
	})
})

it('leaves a season on per-player pricing alone', async () => {
	await seedSeason({ teamRegistrationTotalCents: null })
	await seedTeam(TEAM, true)
	await pay('pi_1', TOTAL)

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

	it('refunds what the team that just registered paid over its total', async () => {
		await seedTeam(TEAM, true)
		await seasonRef().update({ registeredTeamCount: 1 })
		await pay('pi_1', TOTAL)
		await pay('pi_2', 30_000)

		await fire(TEAM)

		expect(stripeCalls()).toEqual(['refund pi_2 30000'])
	})

	describe('the twelfth registration', () => {
		beforeEach(async () => {
			for (let i = 1; i < LOCK; i++) await seedTeam(`reg-${i}`, true)
			await seedTeam(TEAM, true)
			await seasonRef().update({ registeredTeamCount: LOCK })
			await pay('pi_winner', TOTAL)

			await seedTeam('loser-a', false)
			await seedTeam('loser-b', false)
			await pay('pi_a1', 60_000, 'loser-a')
			await pay('pi_a2', 40_000, 'loser-a')
			await pay('pi_b1', 30_000, 'loser-b')
		})

		it('refunds every team that missed out, then removes it', async () => {
			await fire(TEAM)

			expect(stripeCalls().sort()).toEqual(
				[
					'refund pi_a1 60000',
					'refund pi_a2 40000',
					'refund pi_b1 30000',
				].sort()
			)
			expect(
				(await teamSeasonRef(firestore, 'loser-a', SEASON).get()).exists
			).toBe(false)
			expect(
				(await teamSeasonRef(firestore, 'loser-b', SEASON).get()).exists
			).toBe(false)
		})

		it('closes a checkout still open on a team that missed out', async () => {
			// Otherwise its payer could pay for a team that is out, and be
			// refunded at the cost of the fee.
			fakeStripe.sessions.set('cs_open', {
				id: 'cs_open',
				url: 'https://checkout.stripe.com/c/pay/cs_open',
				status: 'open',
				params: {
					line_items: [{ price_data: { unit_amount: 20_000 } }],
					payment_intent_data: { metadata: metadataFor('loser-b') },
					metadata: metadataFor('loser-b'),
				},
				paymentIntentId: null,
			})
			await openCheckoutsRef(firestore, 'loser-b', SEASON).set({
				reservations: {
					r_open: {
						player: firestore.collection('players').doc('payer'),
						amountCents: 20_000,
						sessionId: 'cs_open',
						expiresAt: Timestamp.fromMillis(Date.now() + 20 * 60_000),
						createdAt: Timestamp.now(),
					},
				},
			})

			await fire(TEAM)

			expect(fakeStripe.sessions.get('cs_open')?.status).toBe('expired')
			expect(
				(await openCheckoutsRef(firestore, 'loser-b', SEASON).get()).data()
					?.reservations
			).toEqual({})
		})

		it('keeps the record of what was refunded after the team is gone', async () => {
			await fire(TEAM)

			const entries = await ledger('loser-a')
			expect(entries.pi_a1.status).toBe('refunded')
			expect(entries.pi_a2.status).toBe('refunded')
		})

		it('keeps a team whose money could not be refunded, and retries', async () => {
			// Deleting it would lose track of money it still holds.
			failNext('refund', 'pi_b1')

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
			expect((await ledger('loser-b')).pi_b1.status).toBe('refunded')
		})
	})
})

describe('updateTeamRegistrationOnContributionChange', () => {
	const fire = (
		paymentIntentId: string,
		before: Record<string, unknown> | undefined = undefined
	) =>
		ledger(TEAM).then((entries) =>
			manifest.updateTeamRegistrationOnContributionChange.run({
				id: 'evt-1',
				params: { teamId: TEAM, seasonId: SEASON, paymentIntentId },
				data: {
					before: { exists: before !== undefined, data: () => before },
					after: { exists: true, data: () => entries[paymentIntentId] },
				},
			})
		)

	it('refunds a payment that lands after its team was covered', async () => {
		// A teammate paid while the team was registering.
		await seedTeam(TEAM, true)
		await seasonRef().update({ registeredTeamCount: 1 })
		await pay('pi_1', TOTAL)
		await pay('pi_late', 20_000)

		await fire('pi_late')

		expect(stripeCalls()).toEqual(['refund pi_late 20000'])
	})

	it('refunds a payment that lands after the season filled', async () => {
		await seedTeam(TEAM, false)
		await seasonRef().update({ registeredTeamCount: LOCK })
		await pay('pi_1', 50_000)

		await fire('pi_1')

		expect(stripeCalls()).toEqual(['refund pi_1 50000'])
	})

	it('leaves a fresh payment alone on a team still in the running', async () => {
		await seedTeam(TEAM, false)
		await pay('pi_1', 50_000)

		await fire('pi_1')

		expect(stripeCalls()).toEqual([])
	})

	it('does not settle again for a refund settlement made itself', async () => {
		await seedTeam(TEAM, true)
		await seasonRef().update({ registeredTeamCount: LOCK })
		await pay('pi_1', TOTAL)
		// Something a settlement would act on, were it to run.
		await pay('pi_late', 20_000)

		// pi_1's amount changing fires the trigger; only a new payment
		// settles.
		await fire('pi_1', { status: 'paid', amountCents: TOTAL + 1 })

		expect(stripeCalls()).toEqual([])
	})
})

describe('stripeWebhook reconciles refunds made outside settlement', () => {
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

	const refundedInDashboard = (
		paymentIntentId: string,
		amountCents: number
	) => {
		fakeStripe.intents.get(paymentIntentId)!.latest_charge.amount_refunded =
			amountCents
		return {
			id: `evt_${paymentIntentId}_${amountCents}`,
			type: 'charge.refunded',
			data: {
				object: {
					id: `ch_${paymentIntentId}`,
					payment_intent: paymentIntentId,
				},
			},
		}
	}

	beforeEach(async () => {
		await seedTeam(TEAM, false)
	})

	it('records a refund issued in the Dashboard', async () => {
		await pay('pi_1', 60_000)

		expect(await deliver(refundedInDashboard('pi_1', 60_000))).toBe(200)

		expect((await ledger()).pi_1.status).toBe('refunded')
		expect(await held()).toBe(0)
	})

	it('records a partial refund as a smaller payment', async () => {
		await pay('pi_1', 60_000)

		await deliver(refundedInDashboard('pi_1', 10_000))

		expect((await ledger()).pi_1).toMatchObject({
			status: 'paid',
			amountCents: 50_000,
			paidAmountCents: 60_000,
		})
	})

	it('ignores a per-player payment', async () => {
		addPayment('pi_player', 10_000, { firebaseUID: 'someone' })

		expect(await deliver(refundedInDashboard('pi_player', 10_000))).toBe(200)
		expect(await ledger()).toEqual({})
	})

	it('acknowledges a refund of a contribution not yet recorded', async () => {
		// The refund event outran the checkout completion. That completion
		// reads Stripe fresh, so nothing is lost by skipping.
		addPayment('pi_early', 10_000, metadataFor(TEAM))

		expect(await deliver(refundedInDashboard('pi_early', 10_000))).toBe(200)
		expect(await ledger()).toEqual({})
	})

	it('ignores PaymentIntent events, which the payment flow does not need', async () => {
		await pay('pi_1', 60_000)

		expect(
			await deliver({
				id: 'evt_pi',
				type: 'payment_intent.succeeded',
				data: { object: { id: 'pi_1' } },
			})
		).toBe(200)
		expect((await ledger()).pi_1.status).toBe('paid')
	})
})
