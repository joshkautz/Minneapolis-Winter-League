/**
 * The team contribution ledger.
 *
 * Under team-level pricing a team registers on a collective total rather than
 * ten individual payments, so the money is a property of the team-season and
 * not of any one player. It needs a ledger rather than a running total:
 * refunding a team, or one payer, needs to know who paid what and how much of
 * it the team still holds.
 *
 * The ledger is the only record of a team's money: there are no running
 * totals anywhere else. That is deliberate. Team-season documents are public,
 * and what a team has paid, and who paid it, is visible to its own roster and
 * to admins only — `firestore.rules` enforces that on this subcollection.
 * Anything that needs a total sums the ledger (`paidCents`,
 * `paidByRosterCents`).
 */

import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { TEAM_CONFIG } from '../config/constants.js'
import {
	Collections,
	TEAM_SEASONS_SUBCOLLECTION,
	type ContributionStatus,
	type TeamContributionDocument,
} from '../types.js'

export const CONTRIBUTIONS_SUBCOLLECTION = 'contributions'

/** Contributions and team totals are whole dollars. */
export const CENTS_PER_DOLLAR = 100

/**
 * Thrown when a contribution arrives for a team-season that no longer exists.
 *
 * Distinct from other failures because the caller has to act on it: the
 * money was paid toward a team that is gone, and it must be refunded rather
 * than retried.
 */
export class TeamSeasonNotFoundError extends Error {
	constructor(teamId: string, seasonId: string) {
		super(
			`Cannot record a contribution: no team season at teams/${teamId}/teamSeasons/${seasonId}`
		)
		this.name = 'TeamSeasonNotFoundError'
	}
}

export function teamContributionsCollection(
	firestore: Firestore,
	teamId: string,
	seasonId: string
): FirebaseFirestore.CollectionReference {
	return firestore
		.collection(Collections.TEAMS)
		.doc(teamId)
		.collection(TEAM_SEASONS_SUBCOLLECTION)
		.doc(seasonId)
		.collection(CONTRIBUTIONS_SUBCOLLECTION)
}

/**
 * What a team holds: every payment, less what has been refunded. Pure, so the
 * arithmetic can be tested without a database.
 */
export function paidCents(contributions: TeamContributionDocument[]): number {
	return contributions
		.filter((contribution) => contribution.status === 'paid')
		.reduce((sum, contribution) => sum + contribution.amountCents, 0)
}

/**
 * What a team's **current** roster has paid toward its total — the figure
 * registration and the checkout's remaining balance both use.
 *
 * A payer who has left the team no longer counts: their money is refunded
 * (see `shared/settlement.ts`), and until it is, counting it could register
 * a team on the money of someone who is not on it.
 */
export function paidByRosterCents(
	contributions: TeamContributionDocument[],
	rosterPlayerIds: ReadonlySet<string>
): number {
	return paidCents(
		contributions.filter((contribution) =>
			rosterPlayerIds.has(contribution.player.id)
		)
	)
}

/**
 * Why a proposed contribution is unacceptable, or null if it is fine.
 *
 * Pure so the boundaries can be tested without a database. The caller has
 * already established that something is still owed (`remainingCents > 0`).
 *
 * The floor keeps the processing fee from swallowing a contribution, but it
 * gives way when the balance itself is smaller: a team $5 short has to be
 * able to pay the $5.
 */
export function contributionAmountError(
	amountCents: unknown,
	remainingCents: number
): string | null {
	if (
		typeof amountCents !== 'number' ||
		!Number.isSafeInteger(amountCents) ||
		amountCents <= 0
	) {
		return 'Contribution must be a whole number of cents greater than zero.'
	}

	// Whole dollars keep the remaining balance whole dollars too, so nobody
	// is ever asked for a remainder of cents.
	if (amountCents % CENTS_PER_DOLLAR !== 0) {
		return 'Contribution must be a whole number of dollars.'
	}

	const floor = Math.min(TEAM_CONFIG.MIN_CONTRIBUTION_CENTS, remainingCents)
	if (amountCents < floor) {
		return `Contribution must be at least ${formatDollars(floor)}.`
	}

	if (amountCents > remainingCents) {
		return `Your team only needs ${formatDollars(remainingCents)} more.`
	}

	return null
}

function formatDollars(cents: number): string {
	return `$${(cents / 100).toFixed(2)}`
}

/** Whether a team still holds any money, which must be refunded first. */
export function holdsMoney(contributions: TeamContributionDocument[]): boolean {
	return contributions.some((c) => c.status === 'paid')
}

/**
 * Records a new payment.
 *
 * Keyed on the PaymentIntent id and **insert-only**: a contribution that is
 * already in the ledger is left exactly as it is. Stripe redelivers webhooks,
 * sometimes long after the fact, and a redelivered payment arriving after it
 * was refunded must not wind its status back. Every later change goes
 * through `setContributionStatus`.
 *
 * @throws TeamSeasonNotFoundError if the team-season does not exist
 */
export async function recordContribution(
	firestore: Firestore,
	params: {
		teamId: string
		seasonId: string
		playerId: string
		paymentIntentId: string
		amountCents: number
	}
): Promise<'recorded' | 'already-recorded'> {
	const { teamId, seasonId, paymentIntentId } = params
	const contributionRef = teamContributionsCollection(
		firestore,
		teamId,
		seasonId
	).doc(paymentIntentId)

	return firestore.runTransaction(async (transaction) => {
		const teamSeasonDocRef = firestore
			.collection(Collections.TEAMS)
			.doc(teamId)
			.collection(TEAM_SEASONS_SUBCOLLECTION)
			.doc(seasonId)

		const teamSeasonSnap = await transaction.get(teamSeasonDocRef)
		if (!teamSeasonSnap.exists) {
			throw new TeamSeasonNotFoundError(teamId, seasonId)
		}

		const existing = await transaction.get(contributionRef)
		if (existing.exists) {
			return 'already-recorded' as const
		}

		transaction.create(contributionRef, {
			player: firestore.collection(Collections.PLAYERS).doc(params.playerId),
			amountCents: params.amountCents,
			status: 'paid' satisfies ContributionStatus,
			paymentIntentId,
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp(),
		})

		return 'recorded' as const
	})
}

/** Thrown when a status change names a contribution the ledger does not have. */
export class ContributionNotFoundError extends Error {
	constructor(paymentIntentId: string) {
		super(
			`Cannot update a contribution that does not exist: ${paymentIntentId}`
		)
		this.name = 'ContributionNotFoundError'
	}
}

/**
 * Changes a contribution's status, and optionally its amount.
 *
 * The amount changes when a payment is partly refunded — $500 paid, $200
 * back. What was first paid is kept as `paidAmountCents`, so the record still
 * shows what the payer put in.
 *
 * A change to what is already recorded is a no-op and writes nothing, so a
 * settlement that re-reads Stripe and finds nothing new does not fire the
 * contribution trigger again.
 *
 * @throws ContributionNotFoundError if the contribution is not in the ledger
 */
export async function setContributionStatus(
	firestore: Firestore,
	params: {
		teamId: string
		seasonId: string
		paymentIntentId: string
		status: ContributionStatus
		amountCents?: number
	}
): Promise<'updated' | 'unchanged'> {
	const { teamId, seasonId, paymentIntentId, status } = params

	return firestore.runTransaction(async (transaction) => {
		const contributionRef = teamContributionsCollection(
			firestore,
			teamId,
			seasonId
		).doc(paymentIntentId)

		const contributionSnap = await transaction.get(contributionRef)
		if (!contributionSnap.exists) {
			throw new ContributionNotFoundError(paymentIntentId)
		}
		const current = contributionSnap.data() as TeamContributionDocument
		const amountCents = params.amountCents ?? current.amountCents

		if (current.status === status && current.amountCents === amountCents) {
			return 'unchanged' as const
		}

		transaction.update(contributionRef, {
			status,
			amountCents,
			...(amountCents !== current.amountCents &&
			current.paidAmountCents === undefined
				? { paidAmountCents: current.amountCents }
				: {}),
			updatedAt: FieldValue.serverTimestamp(),
		})

		return 'updated' as const
	})
}
