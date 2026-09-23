/**
 * The team contribution ledger.
 *
 * Under team-level pricing a team registers on a collective total rather than
 * ten individual payments, so the money is a property of the team-season and
 * not of any one player. It needs a ledger rather than a running total:
 * cancelling a hold, capturing it and refunding it all need to know who paid
 * what, and how much of it is still live.
 *
 * `authorizedCents` and `capturedCents` on the team-season are denormalized
 * sums, kept in step with the ledger inside the same transaction that changes
 * it. Never write one without the other — the same rule the roster and
 * player-season pairing follows.
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

/** Statuses whose money is still committed to the team. */
const LIVE_STATUSES: ContributionStatus[] = ['authorized', 'captured']

/**
 * Thrown when a contribution arrives for a team-season that no longer exists.
 *
 * Distinct from other failures because the caller has to act on it: the
 * money is held against a team that is gone, and it must be released rather
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
 * Sums a set of contributions into the two totals the team-season carries.
 *
 * Pure, so the arithmetic can be tested without a database. `authorizedCents`
 * counts money that is committed but not yet taken; `capturedCents` counts
 * money actually taken. A contribution that has been cancelled or refunded
 * counts toward neither.
 */
export function totalsFrom(contributions: TeamContributionDocument[]): {
	authorizedCents: number
	capturedCents: number
} {
	let authorizedCents = 0
	let capturedCents = 0

	for (const contribution of contributions) {
		if (contribution.status === 'authorized') {
			authorizedCents += contribution.amountCents
		} else if (contribution.status === 'captured') {
			capturedCents += contribution.amountCents
		}
	}

	return { authorizedCents, capturedCents }
}

/**
 * What a team has committed toward its registration total.
 *
 * Registration tests **committed**, not captured: a team secures its spot
 * when the money is promised, and capture follows. Both statuses count,
 * because capturing a hold must not make a registered team look unfunded.
 */
export function committedCents(
	contributions: TeamContributionDocument[]
): number {
	const { authorizedCents, capturedCents } = totalsFrom(contributions)
	return authorizedCents + capturedCents
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

/** Whether any of a team's money is still outstanding and unsettled. */
export function hasUnsettledMoney(
	contributions: TeamContributionDocument[]
): boolean {
	return contributions.some((c) => LIVE_STATUSES.includes(c.status))
}

/**
 * Records a new contribution and updates the team's totals atomically.
 *
 * Keyed on the PaymentIntent id and **insert-only**: a contribution that is
 * already in the ledger is left exactly as it is. Stripe redelivers webhooks,
 * sometimes long after the fact, and a redelivered "authorized" arriving
 * after the hold was captured or cancelled must not wind its status back.
 * Every later change goes through `setContributionStatus`.
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
		status: ContributionStatus
		captureBefore?: FirebaseFirestore.Timestamp | null
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

		const existing = await transaction.get(
			teamContributionsCollection(firestore, teamId, seasonId)
		)

		if (existing.docs.some((doc) => doc.id === paymentIntentId)) {
			return 'already-recorded' as const
		}

		const contributions = existing.docs.map(
			(doc) => doc.data() as TeamContributionDocument
		)

		contributions.push({
			player: firestore
				.collection(Collections.PLAYERS)
				.doc(params.playerId) as TeamContributionDocument['player'],
			amountCents: params.amountCents,
			status: params.status,
			paymentIntentId,
			captureBefore: params.captureBefore ?? null,
		} as TeamContributionDocument)

		const totals = totalsFrom(contributions)

		transaction.create(contributionRef, {
			player: firestore.collection(Collections.PLAYERS).doc(params.playerId),
			amountCents: params.amountCents,
			status: params.status,
			paymentIntentId,
			captureBefore: params.captureBefore ?? null,
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp(),
		})
		transaction.update(teamSeasonDocRef, totals)

		return 'recorded' as const
	})
}

/**
 * Moves a contribution to a terminal state and updates the totals.
 *
 * Used when a hold is captured, cancelled or refunded. Idempotent: setting a
 * status it already has is a no-op that still leaves the totals correct.
 */
export async function setContributionStatus(
	firestore: Firestore,
	params: {
		teamId: string
		seasonId: string
		paymentIntentId: string
		status: ContributionStatus
	}
): Promise<void> {
	const { teamId, seasonId, paymentIntentId, status } = params

	await firestore.runTransaction(async (transaction) => {
		const teamSeasonDocRef = firestore
			.collection(Collections.TEAMS)
			.doc(teamId)
			.collection(TEAM_SEASONS_SUBCOLLECTION)
			.doc(seasonId)
		const contributionRef = teamContributionsCollection(
			firestore,
			teamId,
			seasonId
		).doc(paymentIntentId)

		const contributionSnap = await transaction.get(contributionRef)
		if (!contributionSnap.exists) {
			throw new Error(
				`Cannot update a contribution that does not exist: ${paymentIntentId}`
			)
		}

		const all = await transaction.get(
			teamContributionsCollection(firestore, teamId, seasonId)
		)

		const contributions = all.docs.map((doc) => {
			const data = doc.data() as TeamContributionDocument
			return doc.id === paymentIntentId ? { ...data, status } : data
		})

		transaction.update(contributionRef, {
			status,
			updatedAt: FieldValue.serverTimestamp(),
		})
		transaction.update(teamSeasonDocRef, totalsFrom(contributions))
	})
}
