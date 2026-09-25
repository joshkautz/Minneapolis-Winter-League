/**
 * The team registration total an admin sets on a season.
 *
 * Its presence is what puts a season on team payments (see
 * `SeasonDocument.teamRegistrationTotalCents`), so it is validated wherever
 * it is written, and cannot change once money depends on it.
 */

import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import {
	Collections,
	TEAM_SEASONS_SUBCOLLECTION,
	type ContributionStatus,
} from '../types.js'
import {
	CENTS_PER_DOLLAR,
	CONTRIBUTIONS_SUBCOLLECTION,
} from './contributions.js'

/** A sanity cap, well above any plausible team fee: $100,000. */
export const MAX_TEAM_REGISTRATION_TOTAL_CENTS = 10_000_000

/**
 * Checks a proposed total. Whole dollars, because contributions are whole
 * dollars and a total that was not would leave every team owing a remainder
 * nobody is allowed to pay.
 *
 * @throws HttpsError invalid-argument
 */
export function validateTeamRegistrationTotal(value: unknown): number {
	if (
		typeof value !== 'number' ||
		!Number.isSafeInteger(value) ||
		value <= 0 ||
		value % CENTS_PER_DOLLAR !== 0 ||
		value > MAX_TEAM_REGISTRATION_TOTAL_CENTS
	) {
		throw new HttpsError(
			'invalid-argument',
			'The team registration total must be a whole number of dollars, ' +
				'more than $0 and at most $100,000.'
		)
	}
	return value
}

const PAID: ContributionStatus = 'paid'

/**
 * Whether any team in the season holds money.
 *
 * Changing or removing the total then would strand it: settlement decides
 * what to keep and refund from the total, and a season with no total is not
 * settled at all.
 */
export async function seasonHoldsTeamMoney(
	firestore: Firestore,
	seasonId: string
): Promise<boolean> {
	const seasonRef = firestore.collection(Collections.SEASONS).doc(seasonId)
	const teamSeasons = await firestore
		.collectionGroup(TEAM_SEASONS_SUBCOLLECTION)
		.where('season', '==', seasonRef)
		.get()

	for (const teamSeason of teamSeasons.docs) {
		const live = await teamSeason.ref
			.collection(CONTRIBUTIONS_SUBCOLLECTION)
			.where('status', '==', PAID)
			.limit(1)
			.get()
		if (!live.empty) return true
	}
	return false
}
