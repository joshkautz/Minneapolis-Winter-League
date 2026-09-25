import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	DocumentReference,
	Timestamp,
	type DocumentData,
	type Firestore,
} from 'firebase-admin/firestore'
import type { Request, Response } from 'firebase-functions/v2/https'
import { authed, initTestApp, resetFirestore, seedAuthUser } from './helpers.js'
import {
	completeCheckout,
	fakeStripe,
	resetFakeStripe,
	timeOutCheckout,
} from './fake-stripe.js'
import { resetTeamRegistrationProductCache } from '../../Functions/src/shared/stripe.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'
import { teamContributionsCollection } from '../../Functions/src/shared/contributions.js'
import { openCheckoutsRef } from '../../Functions/src/shared/checkoutReservations.js'
import { CURRENT_WAIVER_VERSION_ID } from '../../Functions/src/waiver/versions.js'

/**
 * A team paying for itself together, end to end.
 *
 * Every other payment suite tests one piece against hand-built state. This
 * one drives what players actually do — open Checkout, finish on Stripe's
 * page, sign waivers, leave the team — through the real callables and the
 * real webhook, and fires every trigger production would fire in response,
 * until nothing changes. So it checks the pieces agree with each other:
 * that the money several people put in reaches the ledger, registers the
 * team, and is charged exactly once, in the right amounts, to the right
 * people.
 *
 * The Firestore emulator runs no Functions, so `settleTriggers` stands in
 * for the platform: it diffs the documents the triggers listen on and calls
 * each trigger that a change would have fired.
 */

vi.mock('stripe', async () => ({
	default: (await import('./fake-stripe.js')).FakeStripe,
}))

const TOTAL = 100_000
const SEASON = 'season-1'
const TEAM = 'team-1'
const DAY_MS = 24 * 60 * 60 * 1000
const RETURN = 'https://mplswinterleague.com/manage'

/** Eleven players; the last is the captain, so the others are free to leave. */
const PLAYERS = Array.from({ length: 11 }, (_, i) => `player-${i}`)
const [ALEX, BLAIR, CASEY, DREW] = PLAYERS

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const seasonRef = () => firestore.collection('seasons').doc(SEASON)
const nameOf = (playerId: string) => `Player${playerId.split('-')[1]}`

// ---- The trigger pump ------------------------------------------------------

/** Documents are compared by value, with references and times flattened. */
const comparable = (data: DocumentData | undefined): string =>
	JSON.stringify(data ?? null, (_key, value) =>
		value instanceof DocumentReference
			? `ref:${value.path}`
			: value instanceof Timestamp
				? `ts:${value.toMillis()}`
				: value
	)

const WATCHED_GROUPS = [
	'contributions',
	'teamSeasons',
	'roster',
	'playerSeasons',
] as const

const watchedDocuments = async (): Promise<Map<string, DocumentData>> => {
	const documents = new Map<string, DocumentData>()
	for (const group of WATCHED_GROUPS) {
		const snap = await firestore.collectionGroup(group).get()
		for (const doc of snap.docs) documents.set(doc.ref.path, doc.data())
	}
	return documents
}

const snapshotOf = (data: DocumentData | undefined) => ({
	exists: data !== undefined,
	data: () => data,
})

/** The trigger production would fire for a change at `path`, if any. */
const fireFor = async (
	path: string,
	before: DocumentData | undefined,
	after: DocumentData | undefined
): Promise<void> => {
	const segments = path.split('/')
	const event = (params: Record<string, string>) => ({
		id: `evt-${path}-${Math.random()}`,
		params,
		data: { before: snapshotOf(before), after: snapshotOf(after) },
	})

	// teams/{teamId}/teamSeasons/{seasonId}[/{sub}/{id}]
	if (segments[0] === 'teams' && segments[2] === 'teamSeasons') {
		const [, teamId, , seasonId, sub, id] = segments
		if (sub === 'contributions') {
			await manifest.updateTeamRegistrationOnContributionChange.run(
				event({ teamId, seasonId, paymentIntentId: id })
			)
		} else if (sub === 'roster') {
			await manifest.updateTeamRegistrationOnRosterChange.run(
				event({ teamId, seasonId, playerId: id })
			)
		} else if (sub === undefined && before && after) {
			// onDocumentUpdated: creates and deletes do not fire it.
			await manifest.onTeamRegistrationChange.run(event({ teamId, seasonId }))
		}
		return
	}

	// players/{playerId}/playerSeasons/{seasonId}
	if (segments[0] === 'players' && before && after) {
		await manifest.updateTeamRegistrationOnPlayerChange.run(
			event({ playerId: segments[1], seasonId: segments[3] })
		)
	}
}

/**
 * Runs `action`, then fires the triggers its writes would fire, and the
 * triggers theirs would, until the watched documents stop changing.
 */
const settleTriggers = async <T>(action: () => Promise<T>): Promise<T> => {
	let previous = await watchedDocuments()
	const result = await action()

	for (let round = 0; round < 20; round += 1) {
		const current = await watchedDocuments()
		const changed = [...new Set([...previous.keys(), ...current.keys()])]
			.filter(
				(path) =>
					comparable(previous.get(path)) !== comparable(current.get(path))
			)
			.sort()
		if (changed.length === 0) return result

		const before = previous
		previous = current
		for (const path of changed) {
			await fireFor(path, before.get(path), current.get(path))
		}
	}
	throw new Error('Triggers never settled: something writes in a loop')
}

// ---- What players do -------------------------------------------------------

/** Delivers a Stripe event to the webhook endpoint. */
const deliver = async (event: unknown): Promise<number> => {
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
	return (res.statusCode as number | undefined) ?? 200
}

/** A player opens Checkout for `dollars`; returns the session id. */
const openCheckout = async (
	playerId: string,
	dollars: number
): Promise<string> => {
	const result = await manifest.createTeamContributionCheckout.run({
		auth: authed(playerId),
		data: {
			amountCents: dollars * 100,
			successUrl: `${RETURN}?payment=success`,
			cancelUrl: `${RETURN}?payment=cancel`,
		},
	})
	return result.sessionId as string
}

/** The payer finishes on Stripe's page and Stripe calls the webhook. */
const finishCheckout = async (sessionId: string): Promise<string> =>
	settleTriggers(async () => {
		expect(await deliver(completeCheckout(sessionId))).toBe(200)
		return fakeStripe.sessions.get(sessionId)?.paymentIntentId as string
	})

/** Opening Checkout and finishing it, one after the other. */
const contribute = async (playerId: string, dollars: number) =>
	finishCheckout(await openCheckout(playerId, dollars))

const signWaiver = (playerId: string) =>
	settleTriggers(() =>
		manifest.signWaiver.run({
			auth: authed(playerId),
			rawRequest: { ip: '10.0.0.1', headers: { 'user-agent': 'Vitest' } },
			data: {
				versionId: CURRENT_WAIVER_VERSION_ID,
				dateOfBirth: '1990-05-17',
				mailingAddress: '123 Main St, Minneapolis, MN 55401',
				emergencyContacts: [
					{ name: 'Sam Doe', relationship: 'Partner', phone: '612-555-0100' },
				],
				signerName: `Test ${nameOf(playerId)}`,
				agreed: true,
			},
		})
	)

const signWaivers = async (playerIds: string[]) => {
	for (const playerId of playerIds) await signWaiver(playerId)
}

const leaveTeam = (playerId: string) =>
	settleTriggers(() =>
		manifest.updateTeamRoster.run({
			auth: authed(playerId),
			data: { teamId: TEAM, playerId, action: 'remove' },
		})
	)

/** Moves every open reservation past its time, as half an hour would. */
const pastReservationTimes = async () => {
	const ref = openCheckoutsRef(firestore, TEAM, SEASON)
	const reservations = (await ref.get()).data()?.reservations ?? {}
	for (const id of Object.keys(reservations)) {
		await ref.update({
			[`reservations.${id}.expiresAt`]: Timestamp.fromMillis(Date.now() - 1000),
		})
	}
}

// ---- What to look at -------------------------------------------------------

const isRegistered = async () =>
	(await teamSeasonRef(firestore, TEAM, SEASON).get()).data()?.registered ===
	true

/** The ledger, by payer, as `status amount` (and what was first held). */
const ledgerByPayer = async (): Promise<Record<string, string>> => {
	const snap = await teamContributionsCollection(firestore, TEAM, SEASON).get()
	return Object.fromEntries(
		snap.docs.map((doc) => {
			const c = doc.data()
			const held =
				c.paidAmountCents === undefined ? '' : ` of ${c.paidAmountCents}`
			return [c.player.id, `${c.status} ${c.amountCents}${held}`]
		})
	)
}

/** Every Stripe call that moved money, by payer. */
const stripeCallsByPayer = (): string[] =>
	fakeStripe.calls
		.filter((call) => call.method === 'refund')
		.map((call) => {
			const payer = fakeStripe.intents.get(call.paymentIntentId)?.metadata
				.firebaseUID
			return `${call.method} ${payer} ${call.amount}`
		})

/** Whether a Checkout session can still be paid. */
const sessionStatus = (sessionId: string) =>
	fakeStripe.sessions.get(sessionId)?.status

/** The payer comes back from Stripe without paying; the App cancels. */
const cancelCheckout = (playerId: string) =>
	manifest.cancelTeamContributionCheckout.run({
		auth: authed(playerId),
		data: {},
	})

// ---- Setup -----------------------------------------------------------------

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
	resetTeamRegistrationProductCache()
	await resetFirestore(firestore)

	await seasonRef().set({
		name: '2030 Winter',
		dateStart: Timestamp.fromMillis(Date.now() + 30 * DAY_MS),
		dateEnd: Timestamp.fromMillis(Date.now() + 90 * DAY_MS),
		registrationStart: Timestamp.fromMillis(Date.now() - DAY_MS),
		registrationEnd: Timestamp.fromMillis(Date.now() + 20 * DAY_MS),
		registeredTeamCount: 0,
		teamRegistrationTotalCents: TOTAL,
	})
	await firestore.collection('teams').doc(TEAM).set({})
	await teamSeasonRef(firestore, TEAM, SEASON).set({
		season: seasonRef(),
		name: 'Frostbite',
		logo: null,
		storagePath: null,
		placement: null,
		registered: false,
		registeredDate: null,
	})

	for (const [index, playerId] of PLAYERS.entries()) {
		await seedAuthUser(playerId, true)
		await firestore
			.collection('players')
			.doc(playerId)
			.set({
				admin: false,
				banned: false,
				email: `${playerId}@example.com`,
				firstname: 'Test',
				lastname: nameOf(playerId),
			})
		await teamRosterEntryRef(firestore, TEAM, SEASON, playerId).set({
			player: firestore.collection('players').doc(playerId),
			dateJoined: Timestamp.now(),
		})
		await playerSeasonRef(firestore, playerId, SEASON).set({
			season: seasonRef(),
			team: firestore.collection('teams').doc(TEAM),
			captain: index === PLAYERS.length - 1,
			paid: false,
			signed: false,
		})
	}
})

// ---- The journeys ----------------------------------------------------------

describe('a team paying collectively', () => {
	it('registers once ten have signed and the money is in, and is charged its total', async () => {
		await contribute(ALEX, 400)
		await contribute(BLAIR, 350)
		await contribute(CASEY, 250)

		// All the money, but not yet the players.
		expect(await isRegistered()).toBe(false)
		expect(stripeCallsByPayer()).toEqual([])

		await signWaivers(PLAYERS.slice(0, 10))

		expect(await isRegistered()).toBe(true)
		expect((await seasonRef().get()).data()?.registeredTeamCount).toBe(1)
		// Everyone was charged as they paid, and it came to exactly the
		// total, so nothing is refunded.
		expect(stripeCallsByPayer()).toEqual([])
		expect(await ledgerByPayer()).toEqual({
			[ALEX]: 'paid 40000',
			[BLAIR]: 'paid 35000',
			[CASEY]: 'paid 25000',
		})
	})

	it('registers the moment the last dollar lands, when the players signed first', async () => {
		await signWaivers(PLAYERS.slice(0, 10))
		await contribute(ALEX, 600)
		expect(await isRegistered()).toBe(false)

		await contribute(BLAIR, 400)

		expect(await isRegistered()).toBe(true)
		expect(stripeCallsByPayer()).toEqual([])
	})

	it('never lets two teammates pay the same dollars', async () => {
		// Both see $500 left. Blair opens Checkout first, which sets the $500
		// aside, so Casey is told a teammate is paying it.
		await signWaivers(PLAYERS.slice(0, 10))
		await contribute(ALEX, 500)
		const blairSession = await openCheckout(BLAIR, 500)

		await expect(openCheckout(CASEY, 500)).rejects.toThrow(
			/A teammate is paying the rest/
		)

		await finishCheckout(blairSession)
		expect(await isRegistered()).toBe(true)
		// Exactly the total, so nobody is refunded and no fee is lost.
		expect(stripeCallsByPayer()).toEqual([])
	})

	it('lets a teammate pay what is left beside an open checkout', async () => {
		await signWaivers(PLAYERS.slice(0, 10))
		await contribute(ALEX, 500)
		const blairSession = await openCheckout(BLAIR, 200)

		await expect(openCheckout(CASEY, 400)).rejects.toThrow(
			/only needs \$300\.00 more while a teammate finishes paying \$200\.00/
		)
		await contribute(CASEY, 300)
		await finishCheckout(blairSession)

		expect(await isRegistered()).toBe(true)
		expect(stripeCallsByPayer()).toEqual([])
		expect(await ledgerByPayer()).toEqual({
			[ALEX]: 'paid 50000',
			[BLAIR]: 'paid 20000',
			[CASEY]: 'paid 30000',
		})
	})

	it('frees the amount as soon as a teammate comes back without paying', async () => {
		await contribute(ALEX, 700)
		const blairSession = await openCheckout(BLAIR, 300)
		await expect(openCheckout(CASEY, 300)).rejects.toThrow(/A teammate/)

		await cancelCheckout(BLAIR)

		// Closed at Stripe too, so Blair cannot pay it after all.
		expect(sessionStatus(blairSession)).toBe('expired')
		await expect(openCheckout(CASEY, 300)).resolves.toMatch(/^cs_/)
	})

	it('frees the amount once an abandoned checkout times out', async () => {
		await contribute(ALEX, 700)
		const blairSession = await openCheckout(BLAIR, 300)
		// Blair closed the tab. Half an hour later Stripe closes the session.
		timeOutCheckout(blairSession)
		await pastReservationTimes()

		await expect(openCheckout(CASEY, 300)).resolves.toMatch(/^cs_/)
	})

	it('closes a payer’s earlier checkout when they open another', async () => {
		const first = await openCheckout(BLAIR, 300)

		const second = await openCheckout(BLAIR, 500)

		expect(sessionStatus(first)).toBe('expired')
		expect(() => completeCheckout(first)).toThrow(/expired/)
		await finishCheckout(second)
		expect(await ledgerByPayer()).toEqual({ [BLAIR]: 'paid 50000' })
	})

	it('keeps Stripe’s page, the payment and the ledger in agreement', async () => {
		const sessionId = await openCheckout(ALEX, 250)
		const session = fakeStripe.sessions.get(sessionId)

		// Charged on completion: no hold.
		expect(session?.params.payment_intent_data.capture_method).toBeUndefined()
		expect(session?.params.payment_intent_data.metadata).toEqual({
			kind: 'team_contribution',
			firebaseUID: ALEX,
			teamId: TEAM,
			seasonId: SEASON,
			reservationId: expect.any(String),
		})

		const paymentIntentId = await finishCheckout(sessionId)
		const entry = (
			await teamContributionsCollection(firestore, TEAM, SEASON)
				.doc(paymentIntentId)
				.get()
		).data()
		expect(entry?.status).toBe('paid')
		expect(entry?.amountCents).toBe(25_000)
		expect(entry?.player.id).toBe(ALEX)
	})

	it('shows what is left to the next payer', async () => {
		await contribute(ALEX, 700)

		await expect(openCheckout(BLAIR, 400)).rejects.toThrow(
			/only needs \$300\.00 more/
		)
		await expect(openCheckout(BLAIR, 300)).resolves.toMatch(/^cs_/)
	})
})

describe('a payer who leaves the team', () => {
	it('is refunded straight away, and stops counting, before the team registers', async () => {
		await contribute(ALEX, 600)

		await leaveTeam(ALEX)

		expect(stripeCallsByPayer()).toEqual([`refund ${ALEX} 60000`])
		expect(await ledgerByPayer()).toEqual({ [ALEX]: 'refunded 60000' })
		// The whole total is open again to the people still on the team.
		await expect(openCheckout(BLAIR, 1000)).resolves.toMatch(/^cs_/)
	})

	it('is not charged when the team goes on to register without them', async () => {
		await contribute(ALEX, 600)
		await leaveTeam(ALEX)

		await signWaivers(PLAYERS.slice(1, 11))
		await contribute(BLAIR, 1000)

		expect(await isRegistered()).toBe(true)
		expect(stripeCallsByPayer()).toEqual([`refund ${ALEX} 60000`])
	})

	it('does not register the team on money that left with them', async () => {
		await signWaivers(PLAYERS.slice(1, 11))
		await contribute(ALEX, 600)
		await leaveTeam(ALEX)

		await contribute(BLAIR, 400)

		// Ten signed and $1,000 was put in, but only $400 of it is still the
		// team's.
		expect(await isRegistered()).toBe(false)
		expect(await ledgerByPayer()).toEqual({
			[ALEX]: 'refunded 60000',
			[BLAIR]: 'paid 40000',
		})
	})

	it('stays charged once the team has registered, since that is final', async () => {
		// All eleven signed, so the team keeps its ten when Alex goes.
		await signWaivers(PLAYERS)
		await contribute(ALEX, 1000)
		expect(await isRegistered()).toBe(true)

		await leaveTeam(ALEX)

		expect(await isRegistered()).toBe(true)
		expect(stripeCallsByPayer()).toEqual([])
		expect(await ledgerByPayer()).toEqual({ [ALEX]: 'paid 100000' })
	})

	it('cannot pay for the team after leaving it', async () => {
		// Left while still on Stripe's page: the checkout is closed as they
		// go, so there is nothing to refund.
		const sessionId = await openCheckout(DREW, 500)

		await leaveTeam(DREW)

		expect(sessionStatus(sessionId)).toBe('expired')
		expect(() => completeCheckout(sessionId)).toThrow(/expired/)
		expect(await ledgerByPayer()).toEqual({})
	})
})
