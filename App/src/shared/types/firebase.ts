/**
 * Firebase-specific type definitions
 *
 * Centralized type definitions for Firebase-related data structures,
 * providing better type safety and consistency across the application.
 */

import {
	DocumentReference,
	DocumentData,
	Timestamp,
	QueryDocumentSnapshot,
	DocumentSnapshot,
} from 'firebase/firestore'

// Re-export commonly used Firebase types for convenience
export type {
	DocumentReference,
	DocumentData,
	Timestamp,
	QueryDocumentSnapshot,
	DocumentSnapshot,
} from 'firebase/firestore'

export type { User, UserCredential } from 'firebase/auth'

// Generic Firebase document type with proper typing
export interface FirebaseDocument {
	id: string
	createdAt?: Timestamp
	updatedAt?: Timestamp
}

// Helper type for Firebase document references
export type FirebaseDocRef<T extends DocumentData> = DocumentReference<
	T,
	DocumentData
>

// Helper type for Firebase document snapshots
export type FirebaseDocSnapshot<T extends DocumentData> = DocumentSnapshot<
	T,
	DocumentData
>

// Helper type for Firebase query document snapshots
export type FirebaseQueryDocSnapshot<T extends DocumentData> =
	QueryDocumentSnapshot<T, DocumentData>

// Type for Firebase collection operations result
export interface FirebaseOperationResult<T = unknown> {
	success: boolean
	data?: T
	error?: Error
	documentId?: string
}

// Type for Firebase batch operations
export interface FirebaseBatchOperation {
	type: 'create' | 'update' | 'delete'
	collection: string
	documentId?: string
	data?: DocumentData
}

// Type for Firebase query constraints
export interface FirebaseQueryConstraint {
	field: string
	operator:
		| '=='
		| '!='
		| '<'
		| '<='
		| '>'
		| '>='
		| 'array-contains'
		| 'array-contains-any'
		| 'in'
		| 'not-in'
	value: unknown
}

// Type for Firebase subscription handlers
export type FirebaseSubscriptionHandler<T extends DocumentData> = (
	snapshot: FirebaseDocSnapshot<T> | null,
	error?: Error
) => void

// Type for Firebase collection subscription handlers
export type FirebaseCollectionSubscriptionHandler<T extends DocumentData> = (
	snapshots: FirebaseQueryDocSnapshot<T>[],
	error?: Error
) => void

// Utility type to extract data from Firebase document reference
export type ExtractFirebaseData<T> =
	T extends DocumentReference<infer U, DocumentData> ? U : never
