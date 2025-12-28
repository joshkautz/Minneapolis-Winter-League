/**
 * Formatting utilities for Firebase Functions
 */

/**
 * Formats a date for user-facing error messages with timezone support
 *
 * @param date - The date to format
 * @param timezone - Optional timezone (e.g., 'America/New_York')
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
		...(timezone && { timeZone: timezone }),
	}
	return date.toLocaleDateString('en-US', options)
}
