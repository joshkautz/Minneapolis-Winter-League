/**
 * Date and time utilities
 *
 * Reusable functions for formatting and manipulating dates
 */

import { Timestamp } from '@/types'

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
		month: 'long',
		day: 'numeric',
		year: 'numeric',
	})
}

/**
 * Format a date to a readable date string
 */
export const formatDate = (date: Date): string => {
	return date.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
	})
}

/**
 * Format a date to include time
 */
export const formatDateTime = (date: Date): string => {
	return date.toLocaleDateString('en-US', {
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
