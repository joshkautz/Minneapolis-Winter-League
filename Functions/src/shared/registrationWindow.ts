/**
 * Roster changes close when a season's registration does: creating, rolling
 * over or deleting a team, changing a roster, and sending or answering an
 * offer. Callers skip this for admins, who can fix rosters at any time.
 */

import { HttpsError } from 'firebase-functions/v2/https'
import type { SeasonDocument } from '../types.js'
import { TEAM_CONFIG } from '../config/constants.js'
import { formatDateForUser } from './format.js'

/**
 * Throws `failed-precondition` once `season`'s registration has ended,
 * with `refusal` followed by when it ended, in the caller's timezone.
 */
export function assertRegistrationOpen(
	season: Pick<SeasonDocument, 'registrationEnd'>,
	refusal: string,
	timezone?: string,
	now: Date = new Date()
): void {
	const registrationEnd = season.registrationEnd.toDate()
	if (now > registrationEnd) {
		throw new HttpsError(
			'failed-precondition',
			`${refusal} Registration ended ${formatDateForUser(registrationEnd, timezone)}.`
		)
	}
}

/**
 * How long after registration closes a payment can still complete its team:
 * the longest a Checkout session opened before the close stays open. No
 * checkout opens after the close, so a payment arriving in this window was
 * started while registration was open.
 */
export const LATE_PAYMENT_GRACE_MS =
	TEAM_CONFIG.CHECKOUT_SESSION_LIFETIME_SECONDS * 1000

/** What is completing a team: a new payment, or anything else. */
export type RegistrationTrigger = 'payment' | 'other'

/**
 * Whether a team that qualifies at `now` may register. Before the close,
 * anything can complete it. After the close only a new payment can, and
 * only within the grace a checkout opened before the close needs; a waiver
 * signed or a player added after the close does not.
 */
export function canRegisterAt(
	season: Pick<SeasonDocument, 'registrationEnd'>,
	now: Date,
	trigger: RegistrationTrigger
): boolean {
	const end = season.registrationEnd?.toMillis()
	if (end === undefined) return true
	if (now.getTime() <= end) return true
	return trigger === 'payment' && now.getTime() <= end + LATE_PAYMENT_GRACE_MS
}

/**
 * Whether registration is over for good, so an unregistered team's money is
 * refunded: once the grace for late payments has passed too. Refunding any
 * sooner could refund a team in the middle of registering on a late payment.
 */
export function registrationOverAt(
	season: Pick<SeasonDocument, 'registrationEnd'>,
	now: Date
): boolean {
	const end = season.registrationEnd?.toMillis()
	return end !== undefined && now.getTime() > end + LATE_PAYMENT_GRACE_MS
}
