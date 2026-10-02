import { formatDistanceToNow } from 'date-fns'
/**
 * Date and time utilities
 *
 * Dates and times are shown on Minneapolis's clock, the league's, whatever
 * the reader's own: a 6:00pm kickoff reads 6:00pm everywhere.
 */

import { Timestamp } from '@/types'
import { LEAGUE_TIME_ZONE } from '@/shared/game-rules'

/**
 * Format a Firebase Timestamp to a readable date string
 */
export const formatTimestamp = (
	timestamp: Timestamp | undefined
): string | undefined => {
	if (!timestamp) {
		return undefined
	}

	const date = new Date(timestamp.seconds * 1000)
	return date.toLocaleDateString('en-US', {
		timeZone: LEAGUE_TIME_ZONE,
		month: 'long',
		day: 'numeric',
		year: 'numeric',
	})
}

/** "November 7, 2026 at 6:00 PM". */
const formatDateTime = (date: Date): string => {
	return date.toLocaleDateString('en-US', {
		timeZone: LEAGUE_TIME_ZONE,
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	})
}

/**
 * Format a Firebase Timestamp to include time
 */
export const formatTimestampWithTime = (
	timestamp: Timestamp | undefined
): string | undefined => {
	if (!timestamp) {
		return undefined
	}

	const date = new Date(timestamp.seconds * 1000)
	return formatDateTime(date)
}

/** A short date for tables: "Sep 25, 2026". */
export const formatShortDate = (date: Date): string =>
	date.toLocaleDateString('en-US', {
		timeZone: LEAGUE_TIME_ZONE,
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	})

/** A clock time for tables: "02:30 PM". */
export const formatClockTime = (date: Date): string =>
	date.toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: LEAGUE_TIME_ZONE,
	})

/** A kickoff: "6:00 PM". */
export const formatKickoffTime = (date: Date): string =>
	date.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		timeZone: LEAGUE_TIME_ZONE,
	})

/** How long ago, for feeds: "3 hours ago". */
export const formatRelativeTime = (date: Date): string => {
	try {
		return formatDistanceToNow(date, { addSuffix: true })
	} catch {
		// An invalid date (a timestamp still pending on the server).
		return 'Recently'
	}
}

/**
 * `formatRelativeTime` for a Firestore timestamp, which reads as null while
 * the server has yet to fill it in.
 */
export const formatRelativeTimestamp = (
	timestamp: Timestamp | null | undefined
): string => (timestamp ? formatRelativeTime(timestamp.toDate()) : 'Recently')
