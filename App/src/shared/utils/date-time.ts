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

/**
 * Get relative time string (e.g., "2 hours ago")
 */
export const getRelativeTime = (date: Date): string => {
	const now = new Date()
	const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

	if (diffInSeconds < 60) {
		return 'just now'
	}

	const diffInMinutes = Math.floor(diffInSeconds / 60)
	if (diffInMinutes < 60) {
		return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`
	}

	const diffInHours = Math.floor(diffInMinutes / 60)
	if (diffInHours < 24) {
		return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''} ago`
	}

	const diffInDays = Math.floor(diffInHours / 24)
	if (diffInDays < 7) {
		return `${diffInDays} day${diffInDays !== 1 ? 's' : ''} ago`
	}

	return formatDate(date)
}

/**
 * Check if a date is today
 */
export const isToday = (date: Date): boolean => {
	const today = new Date()
	return date.toDateString() === today.toDateString()
}

/**
 * Format a Firebase Timestamp to MM/DD/YY HH:MM:SS format
 */
export const formatTimestampCompact = (
	timestamp: Timestamp | undefined
): string | undefined => {
	if (!timestamp) {
		return undefined
	}

	const date = new Date(timestamp.seconds * 1000)
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	const year = String(date.getFullYear()).slice(-2)
	const hours = String(date.getHours()).padStart(2, '0')
	const minutes = String(date.getMinutes()).padStart(2, '0')
	const seconds = String(date.getSeconds()).padStart(2, '0')

	return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`
}

/**
 * Format a Firebase Timestamp to a short readable format (e.g., "Oct 1, 2025")
 */
export const formatTimestampShort = (
	timestamp: Timestamp | undefined
): string | undefined => {
	if (!timestamp) {
		return undefined
	}

	const date = new Date(timestamp.seconds * 1000)
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
}

/**
 * Check if a date is in the past
 */
export const isPast = (date: Date): boolean => {
	return date < new Date()
}

/**
 * Check if a date is in the future
 */
export const isFuture = (date: Date): boolean => {
	return date > new Date()
}
