/**
 * Firebase Client SDK Adapter
 *
 * This module provides a clean abstraction layer between Firebase Client SDK functions
 * and the shared types from the admin SDK. It maintains full type safety while allowing
 * the React app to use admin-compatible types throughout the codebase.
 */

import {
	addDoc as firebaseAddDoc,
	updateDoc as firebaseUpdateDoc,
	deleteDoc as firebaseDeleteDoc,
	getDoc as firebaseGetDoc,
	getDocs as firebaseGetDocs,
	doc as firebaseDoc,
	collection as firebaseCollection,
	query as firebaseQuery,
} from 'firebase/firestore'
import type {
	DocumentSnapshot as ClientDocumentSnapshot,
	QueryDocumentSnapshot as ClientQueryDocumentSnapshot,
	QuerySnapshot as ClientQuerySnapshot,
	Query as ClientQuery,
	CollectionReference as ClientCollectionReference,
	UpdateData as ClientUpdateData,
	Firestore as ClientFirestore,
	FirestoreError,
	DocumentReference as ClientDocumentReference,
} from 'firebase/firestore'

import type { DocumentData, Timestamp } from '@/shared/utils'
import { now } from './timestamp-adapter'

// Re-export Timestamp functionality
export { Timestamp }
export const TimestampNow = now

// Export Firebase errors as types
export type { FirestoreError }

/////////////////////////////////////////////////////////////////
///////////////////////// Type Conversion //////////////////////
/////////////////////////////////////////////////////////////////

// Helper function to convert client refs to admin refs
export function convertRef<T = DocumentData>(
	clientRef: any
): DocumentReference<T> {
	return clientRef as DocumentReference<T>
}

// Helper function to convert admin refs to client refs
export function convertAdminRefToClient<T = DocumentData>(
	adminRef: any
): DocumentReference<T> {
	return adminRef as DocumentReference<T>
}

/////////////////////////////////////////////////////////////////
///////////////////////// Type Aliases /////////////////////////
/////////////////////////////////////////////////////////////////

// In the client app, DocumentReference should use client SDK types
export type DocumentReference<T = DocumentData> = ClientDocumentReference<T>

// Create clean type aliases that work with our admin types
export type DocumentSnapshot<T = DocumentData> = ClientDocumentSnapshot<T>
export type QueryDocumentSnapshot<T = DocumentData> =
	ClientQueryDocumentSnapshot<T>
export type QuerySnapshot<T = DocumentData> = ClientQuerySnapshot<T>
export type Query<T = DocumentData> = ClientQuery<T>
export type CollectionReference<T = DocumentData> = ClientCollectionReference<T>

/////////////////////////////////////////////////////////////////
///////////////////////// Core Functions ///////////////////////
/////////////////////////////////////////////////////////////////

/**
 * Type-safe wrapper for addDoc that works with shared types
 */
export const addDoc = async <T extends DocumentData>(
	reference: CollectionReference<T>,
	data: T
): Promise<DocumentReference<T>> => {
	const result = await firebaseAddDoc(reference as any, data)
	return result as unknown as DocumentReference<T>
}

/**
 * Type-safe wrapper for updateDoc that works with shared types
 */
export const updateDoc = async <T extends DocumentData>(
	reference: DocumentReference<T>,
	data: ClientUpdateData<T>
): Promise<void> => {
	return firebaseUpdateDoc(reference as any, data)
}

/**
 * Type-safe wrapper for deleteDoc that works with shared types
 */
export const deleteDoc = async <T extends DocumentData>(
	reference: DocumentReference<T>
): Promise<void> => {
	return firebaseDeleteDoc(reference as any)
}

/**
 * Type-safe wrapper for getDoc that works with shared types
 */
export const getDoc = async <T extends DocumentData>(
	reference: DocumentReference<T>
): Promise<DocumentSnapshot<T>> => {
	return firebaseGetDoc(reference as any) as any
}

/**
 * Type-safe wrapper for getDocs that works with shared types
 */
export const getDocs = async <T extends DocumentData>(
	query: Query<T>
): Promise<QuerySnapshot<T>> => {
	return firebaseGetDocs(query as any) as any
}

/**
 * Type-safe wrapper for doc that works with shared types
 */
export const doc = <T extends DocumentData>(
	firestore: ClientFirestore,
	path: string,
	...pathSegments: string[]
): DocumentReference<T> => {
	const result = firebaseDoc(firestore, path, ...pathSegments)
	return result as unknown as DocumentReference<T>
}

/**
 * Type-safe wrapper for collection that works with shared types
 */
export const collection = <T extends DocumentData>(
	firestore: ClientFirestore,
	path: string,
	...pathSegments: string[]
): CollectionReference<T> => {
	return firebaseCollection(firestore, path, ...pathSegments) as any
}

/**
 * Type-safe wrapper for query that works with shared types
 */
export const query = <T extends DocumentData>(
	query: CollectionReference<T>,
	...queryConstraints: any[]
): Query<T> => {
	return firebaseQuery(query as any, ...queryConstraints) as any
}

/**
 * Re-export query constraint functions (these don't need wrapping)
 */
export { where, orderBy, documentId } from 'firebase/firestore'
