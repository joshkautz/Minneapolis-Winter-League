/**
 * Roster changes close when a season's registration does: creating, rolling
 * over or deleting a team, changing a roster, and sending or answering an
 * offer. Callers skip this for admins, who can fix rosters at any time.
 */

import { HttpsError } from 'firebase-functions/v2/https'
import type { SeasonDocument } from '../types.js'
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
