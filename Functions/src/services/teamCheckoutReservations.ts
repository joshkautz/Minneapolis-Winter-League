/**
 * Reserving a contribution while its payer is on Stripe's Checkout page.
 *
 * A Checkout session stays open for at least thirty minutes, and the balance
 * a contribution was checked against goes stale while it is. Without a
 * reservation, two teammates who both see "$300 left" can both pay it, and
 * the later payment has to be refunded at the cost of its fee. So opening a
 * checkout sets its amount aside: what anyone else may pay is the total, less
 * what the roster has paid, less what is reserved.
 *
 * All of a team-season's reservations live on one document, so claiming one
 * is a single-document transaction that Firestore serialises strictly: of
 * two teammates racing for the last $300, exactly one gets it.
 *
 * A reservation ends when its payment is recorded (the checkout webhook, or
 * the daily reconciliation), when its payer comes back without paying, when
 * they leave the team, when the season fills, or when its session expires.
 * Expiry is never taken on trust: a reservation past its time is checked
 * against Stripe, so a session that completed but whose webhook is late
 * still counts, and its payment is taken in on the spot.
 */

import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import type Stripe from 'stripe'
import {
	Collections,
	type CheckoutReservation,
	type OpenCheckoutsDocument,
	type TeamContributionDocument,
} from '../types.js'
import {
	openCheckoutsRef,
	removeReservation,
	reservedCents,
} from '../shared/checkoutReservations.js'
import {
	paidByRosterCents,
	teamContributionsCollection,
} from '../shared/contributions.js'
import { recordContributionFromStripe } from './teamContributionIntake.js'

async function readReservations(
	firestore: Firestore,
	teamId: string,
	seasonId: string
): Promise<Record<string, CheckoutReservation>> {
	const snap = await openCheckoutsRef(firestore, teamId, seasonId).get()
	return (snap.data() as OpenCheckoutsDocument | undefined)?.reservations ?? {}
}

export type ReserveOutcome =
	| { outcome: 'reserved'; reservationId: string }
	| {
			outcome: 'too-much'
			/** What may still be paid. */
			availableCents: number
			/** Of the rest, what teammates are paying right now. */
			reservedByOthersCents: number
	  }

/**
 * Sets `amountCents` aside for a payer, if the team still has that much to
 * pay once what its roster has paid and what teammates are paying right now
 * are taken off. `validate` decides whether the amount is acceptable against
 * what is available — the same rule as always, whole dollars above a floor —
 * and returns the reason it is not, or null.
 */
export async function reserveContribution(
	firestore: Firestore,
	params: {
		teamId: string
		seasonId: string
		playerId: string
		rosterPlayerIds: ReadonlySet<string>
		totalCents: number
		amountCents: number
		/** Until the session exists: its lifetime, from now. */
		expiresAt: Timestamp
		validate: (amountCents: number, availableCents: number) => string | null
	},
	now: Date = new Date()
): Promise<ReserveOutcome | { outcome: 'invalid'; reason: string }> {
	const { teamId, seasonId, playerId } = params
	const ref = openCheckoutsRef(firestore, teamId, seasonId)
	// A Firestore auto-id: unique, and safe as a field name.
	const reservationId = ref.parent.doc().id

	return firestore.runTransaction(async (transaction) => {
		const [openSnap, contributionsSnap] = await Promise.all([
			transaction.get(ref),
			transaction.get(teamContributionsCollection(firestore, teamId, seasonId)),
		])
		const reservations =
			(openSnap.data() as OpenCheckoutsDocument | undefined)?.reservations ?? {}

		const paid = paidByRosterCents(
			contributionsSnap.docs.map(
				(doc) => doc.data() as TeamContributionDocument
			),
			params.rosterPlayerIds
		)
		const reservedByOthersCents = reservedCents(reservations)
		const availableCents = params.totalCents - paid - reservedByOthersCents

		if (availableCents <= 0 || params.amountCents > availableCents) {
			return {
				outcome: 'too-much' as const,
				availableCents: Math.max(0, availableCents),
				reservedByOthersCents,
			}
		}
		const reason = params.validate(params.amountCents, availableCents)
		if (reason) return { outcome: 'invalid' as const, reason }

		const reservation: CheckoutReservation = {
			player: firestore
				.collection(Collections.PLAYERS)
				.doc(playerId) as CheckoutReservation['player'],
			amountCents: params.amountCents,
			sessionId: null,
			expiresAt: params.expiresAt,
			createdAt: Timestamp.fromDate(now),
		}
		transaction.set(
			ref,
			{ reservations: { [reservationId]: reservation } },
			{ merge: true }
		)
		return { outcome: 'reserved' as const, reservationId }
	})
}

/**
 * Records the session a reservation is for, and when it closes. False if the
 * reservation has already ended — the same payer opened another checkout in
 * the meantime — in which case the session must not be used.
 */
export async function attachSession(
	firestore: Firestore,
	params: {
		teamId: string
		seasonId: string
		reservationId: string
		sessionId: string
		expiresAt: Timestamp
	}
): Promise<boolean> {
	const ref = openCheckoutsRef(firestore, params.teamId, params.seasonId)
	return firestore.runTransaction(async (transaction) => {
		const snap = await transaction.get(ref)
		const reservations = (snap.data() as OpenCheckoutsDocument | undefined)
			?.reservations
		if (!reservations?.[params.reservationId]) return false
		transaction.update(ref, {
			[`reservations.${params.reservationId}.sessionId`]: params.sessionId,
			[`reservations.${params.reservationId}.expiresAt`]: params.expiresAt,
		})
		return true
	})
}

/**
 * Settles one reservation against its Stripe session, and says whether it
 * still stands. An open session is closed if `close` is set, so its payer
 * can no longer pay; a completed one has its payment taken in; either way a
 * session that can no longer take money ends its reservation.
 */
async function settleReservation(
	firestore: Firestore,
	stripe: Stripe,
	params: {
		teamId: string
		seasonId: string
		reservationId: string
		reservation: CheckoutReservation
		close: boolean
	}
): Promise<'ended' | 'still-open'> {
	const { reservation } = params
	if (!reservation.sessionId) {
		// Reserved, but the session was never created — the callable failed
		// between the two. Nobody can pay against it.
		await removeReservation(firestore, params)
		return 'ended'
	}

	let session = await stripe.checkout.sessions.retrieve(reservation.sessionId)
	if (session.status === 'open') {
		if (!params.close) return 'still-open'
		session = await stripe.checkout.sessions.expire(reservation.sessionId)
	}

	if (session.status === 'complete') {
		// Paid; the webhook may not have arrived yet. Taking it in here is
		// what the webhook would do, and is idempotent with it.
		const paymentIntentId =
			typeof session.payment_intent === 'string'
				? session.payment_intent
				: session.payment_intent?.id
		if (paymentIntentId) {
			const paymentIntent = await stripe.paymentIntents.retrieve(
				paymentIntentId,
				{ expand: ['latest_charge'] }
			)
			await recordContributionFromStripe(firestore, stripe, {
				paymentIntent,
				metadata: session.metadata,
			})
		}
	}

	await removeReservation(firestore, params)
	return 'ended'
}

/**
 * Checks every reservation past its time against Stripe, ending the ones
 * that can no longer take money. Run before reserving, so an abandoned
 * checkout stops blocking the team as soon as its session has closed.
 */
export async function resolveExpiredReservations(
	firestore: Firestore,
	stripe: Stripe,
	params: { teamId: string; seasonId: string },
	now: Date = new Date()
): Promise<void> {
	const reservations = await readReservations(
		firestore,
		params.teamId,
		params.seasonId
	)
	for (const [reservationId, reservation] of Object.entries(reservations)) {
		if (reservation.expiresAt.toMillis() > now.getTime()) continue
		await settleReservation(firestore, stripe, {
			...params,
			reservationId,
			reservation,
			close: false,
		})
	}
}

/**
 * Closes open checkouts — one payer's, or everyone's on the team — so they
 * can no longer be paid, and ends their reservations. For a payer who came
 * back without paying, opened another, or left the team, and for teams
 * that missed the last spot. Returns how many were closed.
 */
export async function closeOpenCheckouts(
	firestore: Firestore,
	stripe: Stripe,
	params: { teamId: string; seasonId: string; playerId?: string }
): Promise<number> {
	const reservations = await readReservations(
		firestore,
		params.teamId,
		params.seasonId
	)
	let closed = 0
	for (const [reservationId, reservation] of Object.entries(reservations)) {
		if (params.playerId && reservation.player.id !== params.playerId) continue
		await settleReservation(firestore, stripe, {
			teamId: params.teamId,
			seasonId: params.seasonId,
			reservationId,
			reservation,
			close: true,
		})
		closed += 1
	}
	if (closed > 0) {
		logger.info('Closed open team checkouts', { ...params, closed })
	}
	return closed
}
