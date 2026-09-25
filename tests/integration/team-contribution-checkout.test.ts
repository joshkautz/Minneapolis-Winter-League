import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { Request, Response } from 'firebase-functions/v2/https'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	seedAuthUser,
	type Callable,
	ledgerPaidCents,
} from './helpers.js'
import { TEAM_CONFIG } from '../../Functions/src/config/constants.js'
import {
	recordContribution,
	setContributionStatus,
	teamContributionsCollection,
} from '../../Functions/src/shared/contributions.js'
import {
	resetTeamRegistrationProductCache,
	TEAM_REGISTRATION_PRODUCT_ID,
} from '../../Functions/src/shared/stripe.js'
import { openCheckoutsRef } from '../../Functions/src/shared/checkoutReservations.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'

/**
 * Taking a team contribution: the callable that opens a Checkout session,
 * and the webhook that records the payment once the payer finishes.
 *
 * Stripe is stubbed at the SDK boundary. What is under test is our side —
 * which team the money is attributed to, what the server lets a payer
 * pay, and that no path leaves money paid toward nothing. The stub also lets
 * the tests assert exactly what is sent to Stripe, which is where a missing
 * piece of metadata would cost real money.
 */

const sessionsCreate = vi.fn()
const customersRetrieve = vi.fn()
const customersCreate = vi.fn()
const productsRetrieve = vi.fn()
const productsCreate = vi.fn()
const sessionsRetrieve = vi.fn()
const sessionsExpire = vi.fn()
const paymentIntentsRetrieve = vi.fn()
const refundsCreate = vi.fn()
const constructEvent = vi.fn()

vi.mock('stripe', () => ({
	default: class {
		checkout = {
			sessions: {
				create: sessionsCreate,
				retrieve: sessionsRetrieve,
				expire: sessionsExpire,
			},
		}
		customers = { retrieve: customersRetrieve, create: customersCreate }
		products = { retrieve: productsRetrieve, create: productsCreate }
		paymentIntents = { retrieve: paymentIntentsRetrieve }
		refunds = { create: refundsCreate }
		webhooks = { constructEvent }
	},
}))

const TOTAL = 100_000
const SEASON = 'season-1'
const TEAM = 'team-1'
const OTHER_TEAM = 'team-2'
const PAYER = 'payer'
const RETURN = 'https://mplswinterleague.com/teams/team-1'
const DAY_MS = 24 * 60 * 60 * 1000

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const checkout = (): Callable => manifest.createTeamContributionCheckout
const seasonRef = () => firestore.collection('seasons').doc(SEASON)

const seedSeason = async (overrides: Record<string, unknown> = {}) => {
	await seasonRef().set({
		name: '2030 Winter',
		dateStart: Timestamp.now(),
		registrationStart: Timestamp.fromMillis(Date.now() - DAY_MS),
		registrationEnd: Timestamp.fromMillis(Date.now() + DAY_MS),
		registeredTeamCount: 0,
		teamRegistrationTotalCents: TOTAL,
		...overrides,
	})
}

const seedTeam = async (teamId: string, overrides = {}) => {
	await firestore.collection('teams').doc(teamId).set({ teamId })
	await teamSeasonRef(firestore, teamId, SEASON).set({
		season: seasonRef(),
		name: teamId === TEAM ? 'Frostbite' : 'Other Team',
		logo: null,
		storagePath: null,
		placement: null,
		registered: false,
		registeredDate: null,
		...overrides,
	} as never)
}

/** Puts a player on a team, writing both sides as membership.ts would. */
const seedMember = async (
	playerId: string,
	teamId: string,
	options: { signed?: boolean; banned?: boolean } = {}
) => {
	await firestore
		.collection('players')
		.doc(playerId)
		.set({
			admin: false,
			banned: options.banned ?? false,
			email: `${playerId}@example.com`,
			firstname: 'Test',
			lastname: 'Player',
		})
	await teamRosterEntryRef(firestore, teamId, SEASON, playerId).set({
		player: firestore.collection('players').doc(playerId),
		dateJoined: Timestamp.now(),
	})
	await playerSeasonRef(firestore, playerId, SEASON).set({
		season: seasonRef(),
		team: firestore.collection('teams').doc(teamId),
		captain: false,
		paid: false,
		signed: options.signed ?? false,
	})
}

const request = (data: Record<string, unknown> = {}, uid = PAYER) => ({
	auth: authed(uid),
	data: {
		amountCents: 25_000,
		successUrl: `${RETURN}?payment=success`,
		cancelUrl: `${RETURN}?payment=cancel`,
		...data,
	},
})

const run = (data: Record<string, unknown> = {}, uid = PAYER) =>
	checkout().run(request(data, uid) as never) as Promise<{
		url: string
		sessionId: string
	}>

const codeOf = (data: Record<string, unknown> = {}, uid = PAYER) =>
	errorCodeFrom(checkout(), request(data, uid))

/** The parameters of the one Checkout session the test created. */
const sentSession = () => {
	expect(sessionsCreate).toHaveBeenCalledTimes(1)
	return sessionsCreate.mock.calls[0][0]
}

const ledger = async (teamId = TEAM) =>
	(await teamContributionsCollection(firestore, teamId, SEASON).get()).docs

const held = (teamId = TEAM) => ledgerPaidCents(firestore, teamId, SEASON)

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
	vi.clearAllMocks()
	resetTeamRegistrationProductCache()
	await resetFirestore(firestore)
	await seedAuthUser(PAYER, true)

	customersCreate.mockResolvedValue({ id: 'cus_new' })
	productsRetrieve.mockResolvedValue({ id: TEAM_REGISTRATION_PRODUCT_ID })
	sessionsCreate.mockResolvedValue({
		id: 'cs_test_1',
		url: 'https://checkout.stripe.com/c/pay/cs_test_1',
	})
	sessionsRetrieve.mockImplementation(async (id: string) => ({
		id,
		status: 'open',
	}))
	sessionsExpire.mockImplementation(async (id: string) => ({
		id,
		status: 'expired',
	}))

	await seedSeason()
	await seedTeam(TEAM)
	await seedTeam(OTHER_TEAM)
	await seedMember(PAYER, TEAM)
	await seedMember('someone-else', TEAM)
})

describe('createTeamContributionCheckout', () => {
	describe('the session it creates', () => {
		it('charges the card when the payer completes Checkout', async () => {
			// No hold: a card hold lasts a week, registration a month. Money
			// that should not be kept is refunded instead.
			await run()
			expect(sentSession().payment_intent_data.capture_method).toBeUndefined()
		})

		it('charges the amount the payer chose, against the fixed product', async () => {
			await run({ amountCents: 25_000 })
			expect(sentSession().line_items).toEqual([
				{
					quantity: 1,
					price_data: {
						currency: 'usd',
						unit_amount: 25_000,
						product: TEAM_REGISTRATION_PRODUCT_ID,
					},
				},
			])
		})

		it('attributes the money to the payer’s own team', async () => {
			await run()
			const expected = {
				kind: 'team_contribution',
				firebaseUID: PAYER,
				teamId: TEAM,
				seasonId: SEASON,
				// Which reservation the webhook ends when the payment lands.
				reservationId: expect.any(String),
			}
			// On both objects: the session for the completion webhook, the
			// PaymentIntent for the refund events and reconciliation after it.
			expect(sentSession().metadata).toEqual(expected)
			expect(sentSession().payment_intent_data.metadata).toEqual(
				sentSession().metadata
			)
		})

		it('ignores a team named in the request', async () => {
			// The team is read from the caller's own roster. A request naming
			// another team must not be able to put money on it.
			await run({ teamId: OTHER_TEAM, seasonId: 'season-other' })
			expect(sentSession().metadata.teamId).toBe(TEAM)
			expect(sentSession().metadata.seasonId).toBe(SEASON)
		})

		it('limits payment to cards', async () => {
			await run()
			expect(sentSession().payment_method_types).toEqual(['card'])
		})

		it('tells the payer when they would be refunded', async () => {
			await run()
			const message = sentSession().custom_text.submit.message
			expect(message).toMatch(/^Your card is charged now\./)
			expect(message).toMatch(/you are refunded in full/)
			expect(message).not.toMatch(/authoriz|hold/i)
		})

		it('expires the session just over Stripe’s thirty-minute floor', async () => {
			// The balance the amount was checked against goes stale while the
			// session is open, so it is kept as short as Stripe allows — with
			// a margin, since Stripe rejects anything under thirty minutes by
			// its own clock.
			const before = Math.floor(Date.now() / 1000)
			await run()
			const expiresAt = sentSession().expires_at
			expect(expiresAt).toBeGreaterThanOrEqual(before + 31 * 60)
			expect(expiresAt).toBeLessThanOrEqual(before + 31 * 60 + 5)
		})

		it('describes the charge for the payer’s statement and receipt', async () => {
			await run()
			expect(sentSession().payment_intent_data.description).toBe(
				'Team registration: Frostbite, 2030 Winter'
			)
		})

		it('returns the Checkout URL', async () => {
			const result = await run()
			expect(result).toEqual({
				success: true,
				url: 'https://checkout.stripe.com/c/pay/cs_test_1',
				sessionId: 'cs_test_1',
			})
		})

		it('uses an idempotency key scoped to its reservation', async () => {
			// A retry of the same request gets the same session back.
			await run({ amountCents: 25_000 })
			const options = sessionsCreate.mock.calls[0][1]
			expect(options.idempotencyKey).toBe(
				`team_contribution_${sentSession().metadata.reservationId}`
			)
		})
	})

	describe('the amount', () => {
		it('may not exceed what the team still needs', async () => {
			await recordContribution(firestore, {
				teamId: TEAM,
				seasonId: SEASON,
				playerId: 'someone-else',
				paymentIntentId: 'pi_existing',
				amountCents: 70_000,
			})

			// Whole dollars, so only the balance can be what refuses it.
			expect(await codeOf({ amountCents: 30_100 })).toBe('invalid-argument')
			expect(sessionsCreate).not.toHaveBeenCalled()

			await run({ amountCents: 30_000 })
			expect(sentSession().line_items[0].price_data.unit_amount).toBe(30_000)
		})

		it('does not count a refunded payment', async () => {
			// Money that has gone back is no longer the team's; the balance
			// has to reopen, or a team refunded by an admin could never
			// finish.
			await recordContribution(firestore, {
				teamId: TEAM,
				seasonId: SEASON,
				playerId: 'someone-else',
				paymentIntentId: 'pi_existing',
				amountCents: 70_000,
			})
			await setContributionStatus(firestore, {
				teamId: TEAM,
				seasonId: SEASON,
				paymentIntentId: 'pi_existing',
				status: 'refunded',
			})

			await run({ amountCents: TOTAL })
			expect(sentSession().line_items[0].price_data.unit_amount).toBe(TOTAL)
		})

		it('does not count a teammate who has left', async () => {
			// They are being refunded, so it must not shrink what the rest
			// of the team may put in.
			await recordContribution(firestore, {
				teamId: TEAM,
				seasonId: SEASON,
				playerId: 'departed',
				paymentIntentId: 'pi_departed',
				amountCents: 70_000,
			})

			await run({ amountCents: TOTAL })
			expect(sentSession().line_items[0].price_data.unit_amount).toBe(TOTAL)
		})

		it('ignores another team’s contributions', async () => {
			await recordContribution(firestore, {
				teamId: OTHER_TEAM,
				seasonId: SEASON,
				playerId: 'someone-else',
				paymentIntentId: 'pi_other',
				amountCents: TOTAL,
			})
			await run({ amountCents: TOTAL })
			expect(sessionsCreate).toHaveBeenCalledTimes(1)
		})

		it.each([
			['below the floor', TEAM_CONFIG.MIN_CONTRIBUTION_CENTS - 1],
			['zero', 0],
			['negative', -5_000],
			['fractional', 1_000.5],
			['a string', '25000'],
			['missing', undefined],
		])('is rejected when %s', async (_label, amountCents) => {
			expect(await codeOf({ amountCents })).toBe('invalid-argument')
			expect(sessionsCreate).not.toHaveBeenCalled()
		})

		it('is refused once the team has committed the full amount', async () => {
			await recordContribution(firestore, {
				teamId: TEAM,
				seasonId: SEASON,
				playerId: 'someone-else',
				paymentIntentId: 'pi_existing',
				amountCents: TOTAL,
			})
			expect(await codeOf()).toBe('failed-precondition')
		})
	})

	describe('who may contribute', () => {
		it('refuses a player who is not on a team', async () => {
			await seedAuthUser('free-agent', true)
			await firestore.collection('players').doc('free-agent').set({
				admin: false,
				banned: false,
				email: 'free-agent@example.com',
			})
			expect(await codeOf({}, 'free-agent')).toBe('failed-precondition')
		})

		it('refuses a player whose roster entry is missing', async () => {
			// The two sides of membership disagree. Neither is trusted.
			await teamRosterEntryRef(firestore, TEAM, SEASON, PAYER).delete()
			expect(await codeOf()).toBe('failed-precondition')
		})

		it('refuses a banned player', async () => {
			await firestore.collection('players').doc(PAYER).update({ banned: true })
			expect(await codeOf()).toBe('permission-denied')
		})

		it('refuses an admin who is not on a team', async () => {
			// Early payment is an admin's only bypass. Money has to belong to a
			// team.
			await seedAuthUser('admin-1', true)
			await firestore.collection('players').doc('admin-1').set({
				admin: true,
				banned: false,
				email: 'admin-1@example.com',
			})
			expect(await codeOf({}, 'admin-1')).toBe('failed-precondition')
		})
	})

	describe('when the team or season cannot take money', () => {
		it('refuses a season that does not use team payments', async () => {
			await seasonRef().update({
				teamRegistrationTotalCents: FieldValue.delete(),
			})
			expect(await codeOf()).toBe('failed-precondition')
			expect(sessionsCreate).not.toHaveBeenCalled()
		})

		it.each([
			['not whole dollars', 100_050],
			['zero', 0],
			['negative', -100_000],
		])('refuses a season whose total is %s', async (_label, total) => {
			// Contributions are whole dollars, so such a total would leave every
			// team owing a remainder it is not allowed to pay.
			await seasonRef().update({ teamRegistrationTotalCents: total })
			await expect(run()).rejects.toThrow(/not set up correctly/)
			expect(sessionsCreate).not.toHaveBeenCalled()
		})

		it('treats a null total as no team payments', async () => {
			// An admin form clearing the field may write null rather than
			// deleting it. That must not read as a $0 team total.
			await seasonRef().update({ teamRegistrationTotalCents: null })
			// The message, not just the code: read as a number, null would
			// also fail — as a team that has "already committed" everything.
			await expect(run()).rejects.toThrow(/does not use team payments/)
			expect(sessionsCreate).not.toHaveBeenCalled()
		})

		it('refuses before registration opens', async () => {
			await seasonRef().update({
				registrationStart: Timestamp.fromMillis(Date.now() + DAY_MS),
			})
			expect(await codeOf()).toBe('failed-precondition')
		})

		it('lets an admin contribute before registration opens', async () => {
			// So the flow can be tried with a real card before opening day.
			await firestore.collection('players').doc(PAYER).update({ admin: true })
			await seasonRef().update({
				registrationStart: Timestamp.fromMillis(Date.now() + 7 * DAY_MS),
			})

			await expect(run()).resolves.toMatchObject({
				url: 'https://checkout.stripe.com/c/pay/cs_test_1',
			})
			// An ordinary payment: nothing about it is marked as a test.
			expect(sentSession().payment_intent_data.capture_method).toBeUndefined()
		})

		it('holds an early admin to every other rule', async () => {
			await firestore.collection('players').doc(PAYER).update({ admin: true })
			await seasonRef().update({
				registrationStart: Timestamp.fromMillis(Date.now() + 7 * DAY_MS),
			})

			// More than the team needs is still refused.
			expect(await codeOf({ amountCents: TOTAL + 100 })).toBe(
				'invalid-argument'
			)
			expect(sessionsCreate).not.toHaveBeenCalled()
		})

		it('refuses after registration closes', async () => {
			await seasonRef().update({
				registrationEnd: Timestamp.fromMillis(Date.now() - 1_000),
			})
			expect(await codeOf()).toBe('failed-precondition')
		})

		it('refuses an admin after registration closes', async () => {
			// Money that arrives after the window can only be sent back.
			await firestore.collection('players').doc(PAYER).update({ admin: true })
			await seasonRef().update({
				registrationEnd: Timestamp.fromMillis(Date.now() - 1_000),
			})
			expect(await codeOf()).toBe('failed-precondition')
		})

		it('refuses once every spot has been taken', async () => {
			await seasonRef().update({
				registeredTeamCount: TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK,
			})
			expect(await codeOf()).toBe('failed-precondition')
		})

		it('allows the last open spot to be chased', async () => {
			await seasonRef().update({
				registeredTeamCount: TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK - 1,
			})
			await run()
			expect(sessionsCreate).toHaveBeenCalledTimes(1)
		})

		it('refuses a team that is already registered', async () => {
			await teamSeasonRef(firestore, TEAM, SEASON).update({ registered: true })
			expect(await codeOf()).toBe('failed-precondition')
		})
	})

	describe('return URLs', () => {
		it.each([
			['successUrl', 'https://evil.example/'],
			['cancelUrl', 'https://evil.example/'],
			['successUrl', 'javascript:alert(1)'],
			['cancelUrl', undefined],
		])('rejects %s = %s', async (field, value) => {
			expect(await codeOf({ [field]: value })).toBe('invalid-argument')
			expect(sessionsCreate).not.toHaveBeenCalled()
		})

		it('passes an allowed URL through untouched', async () => {
			await run()
			expect(sentSession().success_url).toBe(`${RETURN}?payment=success`)
			expect(sentSession().cancel_url).toBe(`${RETURN}?payment=cancel`)
		})
	})

	describe('Stripe objects', () => {
		it('creates the product on first use', async () => {
			productsRetrieve.mockRejectedValue({
				type: 'StripeInvalidRequestError',
				code: 'resource_missing',
			})
			await run()
			expect(productsCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					id: TEAM_REGISTRATION_PRODUCT_ID,
					name: 'Team Registration',
				})
			)
		})

		it('tolerates losing the race to create the product', async () => {
			productsRetrieve.mockRejectedValue({
				type: 'StripeInvalidRequestError',
				code: 'resource_missing',
			})
			productsCreate.mockRejectedValue({
				type: 'StripeInvalidRequestError',
				code: 'resource_already_exists',
			})
			await run()
			expect(sessionsCreate).toHaveBeenCalledTimes(1)
		})

		it('does not re-check the product on every checkout', async () => {
			await run()
			sessionsCreate.mockClear()
			await run({ amountCents: 30_000 })
			expect(productsRetrieve).toHaveBeenCalledTimes(1)
		})

		it('reuses the payer’s existing Stripe customer', async () => {
			await firestore
				.collection('stripe')
				.doc(PAYER)
				.set({ stripeId: 'cus_existing' })
			customersRetrieve.mockResolvedValue({ id: 'cus_existing' })

			await run()
			expect(customersCreate).not.toHaveBeenCalled()
			expect(sentSession().customer).toBe('cus_existing')
		})

		it('reports a Stripe failure as internal without leaking it', async () => {
			sessionsCreate.mockRejectedValue(new Error('sk_live_secret exposed'))
			const code = await codeOf()
			expect(code).toBe('internal')

			try {
				await run()
			} catch (error) {
				expect((error as Error).message).not.toMatch(/sk_live/)
			}
		})
	})
})

describe('reserving the amount while the payer is on Stripe’s page', () => {
	// A Checkout session stays open for half an hour. Without a reservation
	// two teammates who both see $300 left could both pay it, and one would
	// be refunded at the cost of its fee.

	const reservations = async () =>
		((await openCheckoutsRef(firestore, TEAM, SEASON).get()).data()
			?.reservations ?? {}) as Record<
			string,
			{
				amountCents: number
				sessionId: string | null
				player: { id: string }
				expiresAt: Timestamp
			}
		>

	/** A teammate's checkout, open on Stripe right now unless told otherwise. */
	const teammateReserves = async (
		amountCents: number,
		options: { sessionId?: string; expiresAt?: number } = {}
	) =>
		openCheckoutsRef(firestore, TEAM, SEASON).set(
			{
				reservations: {
					r_teammate: {
						player: firestore.collection('players').doc('someone-else'),
						amountCents,
						sessionId: options.sessionId ?? 'cs_teammate',
						expiresAt: Timestamp.fromMillis(
							options.expiresAt ?? Date.now() + 20 * 60_000
						),
						createdAt: Timestamp.now(),
					},
				},
			},
			{ merge: true }
		)

	it('sets the amount aside, against the session, until it closes', async () => {
		await run({ amountCents: 25_000 })

		const [[id, reservation]] = Object.entries(await reservations())
		expect(id).toBe(sentSession().metadata.reservationId)
		expect(reservation).toMatchObject({
			amountCents: 25_000,
			sessionId: 'cs_test_1',
			player: { id: PAYER },
		})
		expect(reservation.expiresAt.toMillis()).toBe(
			sentSession().expires_at * 1000
		)
	})

	it('offers only what a teammate is not already paying', async () => {
		await teammateReserves(75_000)

		expect(await codeOf({ amountCents: 30_000 })).toBe('invalid-argument')
		await expect(run({ amountCents: 30_000 })).rejects.toThrow(
			/only needs \$250\.00 more while a teammate finishes paying \$750\.00/
		)
		expect(sessionsCreate).not.toHaveBeenCalled()

		await run({ amountCents: 25_000 })
		expect(sentSession().line_items[0].price_data.unit_amount).toBe(25_000)
	})

	it('refuses anything while a teammate pays the whole rest', async () => {
		await teammateReserves(TOTAL)

		await expect(run({ amountCents: 1_000 })).rejects.toThrow(
			/A teammate is paying the rest of your team’s total right now/
		)
		expect(await codeOf({ amountCents: 1_000 })).toBe('failed-precondition')
	})

	it('frees a teammate’s amount once Stripe says their session expired', async () => {
		await teammateReserves(TOTAL, {
			sessionId: 'cs_abandoned',
			expiresAt: Date.now() - 1_000,
		})
		sessionsRetrieve.mockImplementation(async (id: string) => ({
			id,
			status: id === 'cs_abandoned' ? 'expired' : 'open',
		}))

		await run({ amountCents: TOTAL })

		expect(Object.keys(await reservations())).toEqual([
			sentSession().metadata.reservationId,
		])
	})

	it('keeps counting a teammate’s time-out that Stripe says is still open', async () => {
		// Stripe's clock is the one that closes the session.
		await teammateReserves(TOTAL, { expiresAt: Date.now() - 1_000 })

		expect(await codeOf({ amountCents: 1_000 })).toBe('failed-precondition')
	})

	it('takes in a teammate’s payment whose webhook has not arrived', async () => {
		// Their session completed, so the amount is paid, not free.
		await teammateReserves(75_000, {
			sessionId: 'cs_paid',
			expiresAt: Date.now() - 1_000,
		})
		sessionsRetrieve.mockImplementation(async (id: string) => ({
			id,
			status: id === 'cs_paid' ? 'complete' : 'open',
			payment_intent: 'pi_paid',
			metadata: {
				kind: 'team_contribution',
				firebaseUID: 'someone-else',
				teamId: TEAM,
				seasonId: SEASON,
				reservationId: 'r_teammate',
			},
		}))
		paymentIntentsRetrieve.mockResolvedValue({
			id: 'pi_paid',
			status: 'succeeded',
			amount_received: 75_000,
			latest_charge: { id: 'ch_paid', amount_refunded: 0 },
		})

		await expect(run({ amountCents: 30_000 })).rejects.toThrow(
			/^Your team only needs \$250\.00 more\.$/
		)
		expect(await held()).toBe(75_000)
		expect(await reservations()).toEqual({})
	})

	it('closes the payer’s own earlier checkout when they open another', async () => {
		// One open checkout per payer, so their own earlier one never blocks
		// them, and cannot be paid as well.
		await run({ amountCents: 25_000 })
		sessionsCreate.mockResolvedValue({
			id: 'cs_test_2',
			url: 'https://checkout.stripe.com/c/pay/cs_test_2',
		})

		await run({ amountCents: 40_000 })

		expect(sessionsExpire).toHaveBeenCalledWith('cs_test_1')
		const open = Object.values(await reservations())
		expect(open).toHaveLength(1)
		expect(open[0]).toMatchObject({
			amountCents: 40_000,
			sessionId: 'cs_test_2',
		})
	})

	it('gives up a session whose reservation ended while it was opening', async () => {
		// A double click: the second request closed the first one's
		// reservation before its session existed. Nothing may be paid
		// against a session nothing is reserved for.
		sessionsCreate.mockImplementation(async () => {
			await openCheckoutsRef(firestore, TEAM, SEASON).set({ reservations: {} })
			return {
				id: 'cs_orphan',
				url: 'https://checkout.stripe.com/c/pay/cs_orphan',
			}
		})

		expect(await codeOf()).toBe('aborted')
		expect(sessionsExpire).toHaveBeenCalledWith('cs_orphan')
		expect(await reservations()).toEqual({})
	})

	it('reserves nothing when Stripe fails', async () => {
		sessionsCreate.mockRejectedValue(new Error('Stripe unavailable'))

		expect(await codeOf()).toBe('internal')
		expect(await reservations()).toEqual({})
	})

	it('gives the last $300 to exactly one of two teammates asking at once', async () => {
		await recordContribution(firestore, {
			teamId: TEAM,
			seasonId: SEASON,
			playerId: 'someone-else',
			paymentIntentId: 'pi_existing',
			amountCents: 70_000,
		})
		await seedAuthUser('teammate', true)
		await seedMember('teammate', TEAM)
		let sessions = 0
		sessionsCreate.mockImplementation(async () => {
			sessions += 1
			return {
				id: `cs_race_${sessions}`,
				url: `https://checkout.stripe.com/c/pay/cs_race_${sessions}`,
			}
		})

		const results = await Promise.allSettled([
			run({ amountCents: 30_000 }, PAYER),
			run({ amountCents: 30_000 }, 'teammate'),
		])

		expect(results.map((r) => r.status).sort()).toEqual([
			'fulfilled',
			'rejected',
		])
		expect(sessionsCreate).toHaveBeenCalledTimes(1)
		expect(Object.values(await reservations())).toHaveLength(1)
	})
})

describe('cancelTeamContributionCheckout', () => {
	const cancel = (uid = PAYER) =>
		manifest.cancelTeamContributionCheckout.run({
			auth: authed(uid),
			data: {},
		}) as Promise<{ closed: number }>

	it('closes the payer’s open checkout and frees its amount at once', async () => {
		await run({ amountCents: 25_000 })

		await expect(cancel()).resolves.toMatchObject({ closed: 1 })

		expect(sessionsExpire).toHaveBeenCalledWith('cs_test_1')
		expect(
			(await openCheckoutsRef(firestore, TEAM, SEASON).get()).data()
				?.reservations
		).toEqual({})
	})

	it('leaves a teammate’s checkout alone', async () => {
		await run({ amountCents: 25_000 })
		await seedAuthUser('teammate', true)
		await seedMember('teammate', TEAM)

		await expect(cancel('teammate')).resolves.toMatchObject({ closed: 0 })
		expect(sessionsExpire).not.toHaveBeenCalled()
	})

	it('does nothing for a player with no team', async () => {
		await seedAuthUser('loner', true)
		await expect(cancel('loner')).resolves.toMatchObject({ closed: 0 })
	})
})

describe('stripeWebhook: a completed team contribution', () => {
	const PI = 'pi_test_1'

	const session = (metadata: Record<string, string> | null = {}) => ({
		id: 'cs_test_1',
		object: 'checkout.session',
		payment_intent: PI,
		payment_status: 'paid',
		amount_total: 25_000,
		currency: 'usd',
		// Stripe sends these as null rather than omitting them.
		customer: 'cus_1',
		customer_email: null,
		created: Math.floor(Date.now() / 1000),
		metadata:
			metadata === null
				? {}
				: {
						kind: 'team_contribution',
						firebaseUID: PAYER,
						teamId: TEAM,
						seasonId: SEASON,
						...metadata,
					},
	})

	const paidIntent = (overrides: Record<string, unknown> = {}) => ({
		id: PI,
		status: 'succeeded',
		amount: 25_000,
		amount_received: 25_000,
		latest_charge: { id: 'ch_1', amount_refunded: 0 },
		...overrides,
	})

	const deliver = async (object: unknown) => {
		constructEvent.mockReturnValue({
			id: 'evt_1',
			type: 'checkout.session.completed',
			data: { object },
		})
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

	const legacyPayments = async () =>
		(
			await firestore
				.collection('stripe')
				.doc(PAYER)
				.collection('payments')
				.get()
		).size

	beforeEach(() => {
		paymentIntentsRetrieve.mockResolvedValue(paidIntent())
		refundsCreate.mockResolvedValue({ id: 're_1' })
	})

	it('records the payment against the team', async () => {
		expect(await deliver(session())).toBe(200)

		const docs = await ledger()
		expect(docs).toHaveLength(1)
		expect(docs[0].id).toBe(PI)
		expect(docs[0].data()).toMatchObject({
			amountCents: 25_000,
			status: 'paid',
			paymentIntentId: PI,
		})
		expect(docs[0].data().player.path).toBe(`players/${PAYER}`)
		expect(await held()).toBe(25_000)
	})

	it('ends the reservation its checkout held', async () => {
		// Now the payment counts, the amount set aside for it must not.
		await openCheckoutsRef(firestore, TEAM, SEASON).set({
			reservations: {
				r_1: { amountCents: 25_000, sessionId: 'cs_test_1' },
				r_other: { amountCents: 10_000, sessionId: 'cs_other' },
			},
		})

		await deliver(session({ reservationId: 'r_1' }))

		const open = (await openCheckoutsRef(firestore, TEAM, SEASON).get()).data()
		expect(Object.keys(open?.reservations ?? {})).toEqual(['r_other'])
	})

	it('ends the reservation of a payment it refunds', async () => {
		await openCheckoutsRef(firestore, TEAM, SEASON).set({
			reservations: { r_1: { amountCents: 25_000, sessionId: 'cs_test_1' } },
		})
		await firestore.recursiveDelete(
			teamSeasonRef(firestore, TEAM, SEASON).collection('roster')
		)
		await teamSeasonRef(firestore, TEAM, SEASON).delete()

		await deliver(session({ reservationId: 'r_1' }))

		expect(refundsCreate).toHaveBeenCalledTimes(1)
		const open = (await openCheckoutsRef(firestore, TEAM, SEASON).get()).data()
		expect(open?.reservations).toEqual({})
	})

	it('takes the amount from Stripe, not the session', async () => {
		// The session's amount_total is what was asked for; the
		// PaymentIntent's is what was actually received.
		paymentIntentsRetrieve.mockResolvedValue(
			paidIntent({ amount_received: 20_000 })
		)
		await deliver(session())
		expect((await ledger())[0].data().amountCents).toBe(20_000)
	})

	it('asks Stripe for the charge along with the PaymentIntent', async () => {
		await deliver(session())
		expect(paymentIntentsRetrieve).toHaveBeenCalledWith(PI, {
			expand: ['latest_charge'],
		})
	})

	it('does not mark the payer paid as an individual', async () => {
		// The per-player path writes stripe/{uid}/payments, which triggers
		// onPaymentCreated. A contribution is the team's money.
		await deliver(session())
		expect(await legacyPayments()).toBe(0)
	})

	it('records a redelivered event once', async () => {
		// And acknowledges it: a redelivery answered with an error would have
		// Stripe retry it for days.
		expect(await deliver(session())).toBe(200)
		expect(await deliver(session())).toBe(200)

		expect(await ledger()).toHaveLength(1)
		expect(await held()).toBe(25_000)
	})

	it('does not undo a refund when the event is redelivered', async () => {
		// Stripe can redeliver hours later. By then the payment may have been
		// refunded, and winding it back to "paid" would count it again.
		await deliver(session())
		await setContributionStatus(firestore, {
			teamId: TEAM,
			seasonId: SEASON,
			paymentIntentId: PI,
			status: 'refunded',
		})

		await deliver(session())

		expect((await ledger())[0].data().status).toBe('refunded')
		expect(await held()).toBe(0)
	})

	it('records nothing when the PaymentIntent was not paid', async () => {
		paymentIntentsRetrieve.mockResolvedValue(
			paidIntent({ status: 'requires_payment_method', amount_received: 0 })
		)
		expect(await deliver(session())).toBe(200)
		expect(await ledger()).toHaveLength(0)
		expect(refundsCreate).not.toHaveBeenCalled()
	})

	describe('money that cannot be attributed is refunded, not kept', () => {
		it('refunds the payment when the team was deleted mid-checkout', async () => {
			// Deletion refuses a team with money in its ledger, but a checkout
			// still on Stripe's page is not in the ledger yet.
			await firestore.recursiveDelete(firestore.collection('teams').doc(TEAM))

			expect(await deliver(session())).toBe(200)

			expect(refundsCreate).toHaveBeenCalledWith(
				{ payment_intent: PI },
				{ idempotencyKey: `refund_unattributable_${PI}` }
			)
			expect(await ledger()).toHaveLength(0)
		})

		it('refunds the payment when the metadata is incomplete', async () => {
			expect(await deliver(session({ teamId: '' }))).toBe(200)
			expect(refundsCreate).toHaveBeenCalledTimes(1)
			expect(await ledger()).toHaveLength(0)
		})

		it('does not refund money that has already been refunded', async () => {
			// A refund leaves the PaymentIntent `succeeded`. Without netting
			// out the refunded amount, a late redelivery would refund twice.
			await firestore.recursiveDelete(firestore.collection('teams').doc(TEAM))
			paymentIntentsRetrieve.mockResolvedValue(
				paidIntent({ latest_charge: { id: 'ch_1', amount_refunded: 25_000 } })
			)

			expect(await deliver(session())).toBe(200)
			expect(refundsCreate).not.toHaveBeenCalled()
		})
	})

	it('fails the delivery, so Stripe retries, when recording fails otherwise', async () => {
		paymentIntentsRetrieve.mockRejectedValue(new Error('Stripe unavailable'))
		expect(await deliver(session())).toBe(500)
		expect(refundsCreate).not.toHaveBeenCalled()
	})

	it('leaves the per-player checkout on its original path', async () => {
		// No `kind`: a season still on per-player pricing.
		await deliver({
			...session(null),
			metadata: { firebaseUID: PAYER },
			payment_status: 'paid',
		})

		expect(await legacyPayments()).toBe(1)
		expect(await ledger()).toHaveLength(0)
		expect(paymentIntentsRetrieve).not.toHaveBeenCalled()
	})

	it('registers a team whose players were waiting on the money', async () => {
		// The case this feature exists for, end to end: ten signed players,
		// one payer covers the lot, and the contribution trigger claims the
		// spot. Functions do not run in this emulator, so the trigger is
		// fired by hand with what the ledger write would have delivered.
		for (let i = 0; i < TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION; i++) {
			await seedMember(`signed-${i}`, TEAM, { signed: true })
		}
		paymentIntentsRetrieve.mockResolvedValue(
			paidIntent({ amount: TOTAL, amount_received: TOTAL })
		)

		await deliver(session())
		const after = (await ledger())[0].data()
		await manifest.updateTeamRegistrationOnContributionChange.run({
			params: { teamId: TEAM, seasonId: SEASON, paymentIntentId: PI },
			data: {
				before: { exists: false, data: () => undefined },
				after: { exists: true, data: () => after },
			},
		})

		const teamSeason = (
			await teamSeasonRef(firestore, TEAM, SEASON).get()
		).data()
		expect(teamSeason?.registered).toBe(true)
		expect((await seasonRef().get()).data()?.registeredTeamCount).toBe(1)
		// It paid exactly its total, so settling it refunds nothing.
		expect(refundsCreate).not.toHaveBeenCalled()
		expect((await ledger())[0].data().status).toBe('paid')
	})
})

describe('createStripeCheckout (per-player) return URLs', () => {
	// The per-player checkout passed client URLs to Stripe unchecked, which
	// made it an open redirect. It shares the validator now.
	const perPlayer = (successUrl: unknown, cancelUrl: unknown) => ({
		auth: authed(PAYER),
		data: { priceId: 'price_test', successUrl, cancelUrl },
	})

	it.each([
		['successUrl', 'https://evil.example/', `${RETURN}?payment=cancel`],
		['cancelUrl', `${RETURN}?payment=success`, 'https://evil.example/'],
	])('rejects a foreign %s', async (_field, successUrl, cancelUrl) => {
		expect(
			await errorCodeFrom(
				manifest.createStripeCheckout,
				perPlayer(successUrl, cancelUrl)
			)
		).toBe('invalid-argument')
		expect(sessionsCreate).not.toHaveBeenCalled()
	})

	it('accepts the league’s own URLs', async () => {
		await manifest.createStripeCheckout.run(
			perPlayer(`${RETURN}?payment=success`, `${RETURN}?payment=cancel`)
		)
		expect(sentSession().success_url).toBe(`${RETURN}?payment=success`)
		expect(sentSession().line_items).toEqual([
			{ price: 'price_test', quantity: 1 },
		])
	})
})
