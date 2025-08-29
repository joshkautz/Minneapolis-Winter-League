/**
 * Firebase Timestamp Adapter
 *
 * Simplified timestamp handling for Firebase Client SDK
 */

import { Timestamp as ClientTimestamp } from 'firebase/firestore'

/**
 * Converts a Firebase Client Timestamp to a compatible object
 * Since we're using client SDK throughout, this is now a pass-through
 */
export const convertToAdminTimestamp = (
	clientTimestamp: ClientTimestamp
): ClientTimestamp => {
	// Since we're now using client types throughout, just return the client timestamp
	return clientTimestamp
}

/**
 * Converts a timestamp to a Firebase Client Timestamp
 * Since we're using client SDK throughout, this is now a pass-through
 */
export const convertToClientTimestamp = (
	timestamp: ClientTimestamp
): ClientTimestamp => {
	// Since we're using client types throughout, just return the timestamp
	return timestamp
}

/**
 * Helper to check if a value is a timestamp
 */
export const isTimestamp = (
	value: any
): value is ClientTimestamp => {
	return (
		value &&
		typeof value === 'object' &&
		typeof value.seconds === 'number' &&
		typeof value.nanoseconds === 'number'
	)
}

/**
 * Creates a timestamp from the current time
 */
export const now = (): ClientTimestamp => {
	return ClientTimestamp.now()
}
