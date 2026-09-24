/**
 * Formatting utilities for Firebase Functions
 */

import { FIREBASE_CONFIG } from '../config/constants.js'

/**
 * Formats a date for user-facing error messages with timezone support
 *
 * @param date - The date to format
 * @param timezone - The reader's zone (e.g., 'America/New_York'). Without
 *   one, Minneapolis: the server's own zone is UTC, which put registration
 *   deadlines at "November 1, 4:59 AM UTC" instead of October 31, 11:59 PM.
 * @returns Formatted date string (e.g., "January 15, 2025, 6:00 PM CST")
 */
export function formatDateForUser(date: Date, timezone?: string): string {
	const options: Intl.DateTimeFormatOptions = {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short',
		timeZone: timezone || FIREBASE_CONFIG.TIME_ZONE,
	}
	return date.toLocaleDateString('en-US', options)
}
