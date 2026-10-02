/**
 * When a game may be played: the league's Saturday-evening slots.
 *
 * The admin's browser sends the kickoff as an ISO 8601 string with its own
 * UTC offset, for example `2026-11-07T18:45:00.000-06:00`. The day and time
 * are checked against the wall-clock part of that string, not against the
 * parsed instant: Cloud Functions run in UTC, where a 6:00pm Central kickoff
 * is already Sunday. Reading the string keeps a slot the same slot either
 * side of the November DST change, and the stored Timestamp is still the
 * exact instant.
 */

import { HttpsError } from 'firebase-functions/v2/https'
import { GAME_CONFIG } from '../config/constants.js'
import type { GameForfeit } from '../types.js'

const ISO_WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/

/** `Date.getUTCDay()` for Saturday. */
const SATURDAY = 6

/**
 * Parses and checks a game's kickoff, throwing `invalid-argument` unless it is
 * a valid timestamp on a Saturday in one of `GAME_CONFIG.ALLOWED_TIME_SLOTS`.
 */
export function parseGameKickoff(timestamp: string): Date {
	const kickoff = new Date(timestamp)
	const wallClock = timestamp.match(ISO_WALL_CLOCK)
	if (isNaN(kickoff.getTime()) || !wallClock) {
		throw new HttpsError(
			'invalid-argument',
			'Invalid timestamp format. Must be a valid ISO 8601 string'
		)
	}
	const [, year, month, day, hours, minutes] = wallClock

	// The calendar date as written, independent of any timezone.
	const weekday = new Date(
		Date.UTC(Number(year), Number(month) - 1, Number(day))
	).getUTCDay()
	if (weekday !== SATURDAY) {
		throw new HttpsError(
			'invalid-argument',
			`Games can only be scheduled on Saturdays (received ${year}-${month}-${day})`
		)
	}

	const slot = `${hours}:${minutes}`
	if (!(GAME_CONFIG.ALLOWED_TIME_SLOTS as readonly string[]).includes(slot)) {
		throw new HttpsError(
			'invalid-argument',
			`Games can only be scheduled at 6:00pm, 6:45pm, 7:30pm, or 8:15pm CT (received: ${slot})`
		)
	}

	return kickoff
}

/**
 * A new game's document id: one per season, kickoff and field, so two games
 * cannot be created in the same slot.
 */
export const gameSlotId = (
	seasonId: string,
	kickoff: Date,
	field: number
): string => `${seasonId}_${kickoff.toISOString()}_${field}`

/** Whether `field` is one of the league's numbered fields. */
export const isGameField = (field: unknown): field is number =>
	(GAME_CONFIG.ALLOWED_FIELDS as readonly unknown[]).includes(field)

/**
 * Checks a game's `forfeit`: which side forfeited, or null for neither.
 * Throws `invalid-argument` for anything else.
 */
export function parseForfeit(value: unknown): GameForfeit | null {
	if (value === null || value === undefined) return null
	if (value === 'home' || value === 'away') return value
	throw new HttpsError(
		'invalid-argument',
		'Forfeit must be "home", "away" or empty.'
	)
}

/** A forfeit names the side that gave up the game, so both sides are needed. */
export const FORFEIT_NEEDS_BOTH_TEAMS =
	'A forfeit needs both teams on the game.'
