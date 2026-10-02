/**
 * Receipts for team payments and refunds, sent by the league instead of by
 * Stripe (whose customer emails are turned off in its Dashboard).
 *
 * Every payment and every refund lands in the contribution ledger, whichever
 * route it took — Checkout, the reconciliation, settlement, an admin, the
 * Stripe Dashboard — so `emailContributionReceipt` reads the ledger's
 * changes and sends one receipt per change. A payment Stripe gave straight
 * back because it had no team to go to never reaches the ledger; the intake
 * sends that one (`queueUnattributableRefundReceipt`).
 *
 * Each receipt has a stable id, so a retried trigger cannot send it twice.
 */

import type { Firestore } from 'firebase-admin/firestore'
import type Stripe from 'stripe'
import { FIREBASE_CONFIG } from '../config/constants.js'
import {
	Collections,
	type PlayerSeasonDocument,
	type SeasonDocument,
	type TeamContributionDocument,
	type TeamSeasonDocument,
	ROSTER_SUBCOLLECTION,
} from '../types.js'
import { playerSeasonRef, teamSeasonRef } from '../shared/database.js'
import {
	paidByRosterCents,
	teamContributionsCollection,
} from '../shared/contributions.js'
import { countsTowardRegistration } from '../services/teamRegistration.js'
import { queueEmailOnce } from './outbox.js'
import type { TeamStanding } from './templates/Receipts.js'
import { MIN_SIGNED_PLAYERS } from '../shared/teamPaymentRules.js'

const dollars = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
})

/** "$1,000.00" */
export const formatMoney = (cents: number): string =>
	dollars.format(cents / 100)

/** "Tuesday, September 29, 2026", on Minneapolis's calendar. */
const receiptDate = (date: Date): string =>
	new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		timeZone: FIREBASE_CONFIG.TIME_ZONE,
	}).format(date)

export type Receipt =
	| { kind: 'payment' }
	| { kind: 'refund'; refundedCents: number; fullRefund: boolean }

/**
 * Which receipt a ledger change calls for, if any. A payment is a new paid
 * contribution; a refund is a paid one becoming refunded, or holding less
 * after a partial refund. Anything else (a deletion, a metadata update, a
 * replay that changes nothing) sends nothing.
 */
export function receiptFor(
	before: TeamContributionDocument | undefined,
	after: TeamContributionDocument | undefined
): Receipt | null {
	if (!before) return after?.status === 'paid' ? { kind: 'payment' } : null
	if (before.status !== 'paid' || !after) return null
	if (after.status === 'refunded') {
		return {
			kind: 'refund',
			refundedCents: before.amountCents,
			fullRefund: before.paidAmountCents === undefined,
		}
	}
	if (after.amountCents < before.amountCents) {
		return {
			kind: 'refund',
			refundedCents: before.amountCents - after.amountCents,
			fullRefund: false,
		}
	}
	return null
}

/**
 * The receipt's mail id. A payment has one receipt; each refund of it is
 * told apart by what the contribution held after it.
 */
export function receiptMailId(
	paymentIntentId: string,
	receipt: Receipt,
	after: TeamContributionDocument | undefined
): string {
	return receipt.kind === 'payment'
		? `receipt-${paymentIntentId}`
		: `refund-${paymentIntentId}-${after?.status}-${after?.amountCents}`
}

const CARD_BRANDS: Record<string, string> = {
	amex: 'American Express',
	diners: 'Diners Club',
	discover: 'Discover',
	jcb: 'JCB',
	mastercard: 'Mastercard',
	unionpay: 'UnionPay',
	visa: 'Visa',
}

const WALLETS: Record<string, string> = {
	apple_pay: 'Apple Pay',
	google_pay: 'Google Pay',
	link: 'Link',
}

/** "Visa •••• 4242", "Apple Pay (Visa •••• 4242)" or "Link"; null if unknown. */
export function paymentMethodOf(
	charge: Pick<Stripe.Charge, 'payment_method_details'> | null
): string | null {
	const details = charge?.payment_method_details
	if (!details) return null
	if (details.type === 'link') return 'Link'
	const card = details.card
	if (!card) return null
	const wallet = card.wallet?.type ? WALLETS[card.wallet.type] : undefined
	if (wallet === 'Link') return 'Link'
	const brand = CARD_BRANDS[card.brand ?? ''] ?? 'Card'
	const cardText = `${brand} •••• ${card.last4 ?? ''}`.trim()
	return wallet ? `${wallet} (${cardText})` : cardText
}

/**
 * The team named in a payment's description, which our checkout writes as
 * "Team registration: <team>, <season>". Null for any other description.
 */
export function teamNameFromDescription(
	description: string | null | undefined
): string | null {
	const match = description?.match(/^Team registration: (.+), [^,]+$/)
	return match?.[1] ?? null
}

/** The charge behind a PaymentIntent retrieved with its latest charge. */
const chargeOf = (paymentIntent: Stripe.PaymentIntent): Stripe.Charge | null =>
	typeof paymentIntent.latest_charge === 'object'
		? paymentIntent.latest_charge
		: null

/**
 * The team's money and signed players now, counted as registration counts
 * them: only money from players still on the roster.
 */
async function standingOf(
	firestore: Firestore,
	teamId: string,
	seasonId: string,
	season: SeasonDocument
): Promise<TeamStanding | null> {
	const feeCents = season.teamRegistrationTotalCents
	if (typeof feeCents !== 'number') return null
	const teamSeasonDoc = teamSeasonRef(firestore, teamId, seasonId)
	const [contributions, roster] = await Promise.all([
		teamContributionsCollection(firestore, teamId, seasonId).get(),
		teamSeasonDoc.collection(ROSTER_SUBCOLLECTION).get(),
	])
	const rosterIds = new Set(roster.docs.map((doc) => doc.id))
	const playerSeasons = await Promise.all(
		roster.docs.map((doc) => playerSeasonRef(firestore, doc.id, seasonId).get())
	)
	const paid = paidByRosterCents(
		contributions.docs.map((doc) => doc.data() as TeamContributionDocument),
		rosterIds
	)
	return {
		paid: formatMoney(paid),
		fee: formatMoney(feeCents),
		remaining: formatMoney(Math.max(feeCents - paid, 0)),
		signedPlayers: playerSeasons.filter((snap) =>
			countsTowardRegistration(
				snap.data() as PlayerSeasonDocument | undefined,
				season
			)
		).length,
		signedPlayersNeeded: MIN_SIGNED_PLAYERS,
	}
}

/** Sends the receipt a change to a team's contribution calls for. */
export async function queueContributionReceipt(
	firestore: Firestore,
	stripe: Stripe,
	params: {
		teamId: string
		seasonId: string
		paymentIntentId: string
		before: TeamContributionDocument | undefined
		after: TeamContributionDocument | undefined
	}
): Promise<'queued' | 'already-queued' | 'none'> {
	const { teamId, seasonId, paymentIntentId, before, after } = params
	const receipt = receiptFor(before, after)
	const contribution = after ?? before
	if (!receipt || !contribution) return 'none'

	const [seasonSnap, teamSeasonSnap, paymentIntent] = await Promise.all([
		firestore.collection(Collections.SEASONS).doc(seasonId).get(),
		teamSeasonRef(firestore, teamId, seasonId).get(),
		stripe.paymentIntents.retrieve(paymentIntentId, {
			expand: ['latest_charge'],
		}),
	])
	const season = seasonSnap.data() as SeasonDocument | undefined
	const teamSeason = teamSeasonSnap.data() as TeamSeasonDocument | undefined
	const charge = chargeOf(paymentIntent)
	const teamRegistered = teamSeason?.registered === true
	// A registered team is simply in: its receipts say so rather than count
	// what it has paid, which after a leaver can read short of a total that
	// no longer matters.
	const standing =
		season && teamSeason && !teamRegistered
			? await standingOf(firestore, teamId, seasonId, season)
			: null
	// The team-season is gone once a team that missed out is deleted, but
	// the name is on the payment our checkout created.
	const teamName =
		teamSeason?.name ??
		teamNameFromDescription(paymentIntent.description) ??
		'your team'
	const seasonName = season?.name ?? 'this season'
	const id = receiptMailId(paymentIntentId, receipt, after)
	const to = { playerId: contribution.player.id }

	if (receipt.kind === 'payment') {
		return queueEmailOnce(firestore, {
			id,
			to,
			template: 'teamPaymentReceipt',
			props: {
				teamName,
				seasonName,
				teamRegistered,
				amount: formatMoney(contribution.amountCents),
				paidOn: receiptDate(contribution.createdAt?.toDate() ?? new Date()),
				paymentMethod: paymentMethodOf(charge),
				receiptUrl: charge?.receipt_url ?? null,
				standing,
			},
		})
	}
	return queueEmailOnce(firestore, {
		id,
		to,
		template: 'teamRefundReceipt',
		props: {
			teamName,
			seasonName,
			cause: contribution.refundCause ?? null,
			teamRegistered,
			amount: formatMoney(receipt.refundedCents),
			refundedOn: receiptDate(contribution.updatedAt?.toDate() ?? new Date()),
			originallyPaid: formatMoney(
				contribution.paidAmountCents ??
					before?.paidAmountCents ??
					before?.amountCents ??
					contribution.amountCents
			),
			fullRefund: receipt.fullRefund,
			receiptUrl: charge?.receipt_url ?? null,
			standing,
		},
	})
}

/**
 * The refund receipt for money Stripe took with no team to credit, and
 * which the intake gave straight back. `paymentIntent` must have been
 * retrieved with its latest charge.
 */
export async function queueUnattributableRefundReceipt(
	firestore: Firestore,
	params: {
		playerId: string
		seasonId: string | undefined
		paymentIntent: Stripe.PaymentIntent
		amountCents: number
	}
): Promise<'queued' | 'already-queued'> {
	const { playerId, seasonId, paymentIntent, amountCents } = params
	const season = seasonId
		? ((
				await firestore.collection(Collections.SEASONS).doc(seasonId).get()
			).data() as SeasonDocument | undefined)
		: undefined
	return queueEmailOnce(firestore, {
		id: `refund-unattributable-${paymentIntent.id}`,
		to: { playerId },
		template: 'teamRefundReceipt',
		props: {
			teamName: teamNameFromDescription(paymentIntent.description),
			seasonName: season?.name ?? 'this season',
			cause: 'team-deleted',
			teamRegistered: false,
			amount: formatMoney(amountCents),
			refundedOn: receiptDate(new Date()),
			originallyPaid: formatMoney(amountCents),
			fullRefund: true,
			receiptUrl: chargeOf(paymentIntent)?.receipt_url ?? null,
			standing: null,
		},
	})
}
