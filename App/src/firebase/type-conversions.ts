/**
 * Type conversion utilities for Firebase Admin vs Client SDK compatibility
 */

import type {
	DocumentReference,
	DocumentData,
	Timestamp,
} from 'firebase/firestore'

/**
 * Safely converts a Firebase Admin DocumentReference to a Firebase Client DocumentReference
 * by extracting only the compatible properties
 */
export function convertDocumentReference<T>(
	adminRef: any
): DocumentReference<T, DocumentData> {
	return adminRef as DocumentReference<T, DocumentData>
}

/**
 * Safely converts a Firebase Admin Timestamp to a Firebase Client Timestamp
 */
export function convertTimestamp(adminTimestamp: any): Timestamp {
	return adminTimestamp as Timestamp
}

/**
 * Type guard to check if a value is a valid DocumentReference
 */
export function isDocumentReference(
	value: any
): value is DocumentReference<any, DocumentData> {
	return value && typeof value === 'object' && 'id' in value && 'path' in value
}

/**
 * Type guard to check if a value is a valid Timestamp
 */
export function isTimestamp(value: any): value is Timestamp {
	return (
		value &&
		typeof value === 'object' &&
		'seconds' in value &&
		'nanoseconds' in value
	)
}
