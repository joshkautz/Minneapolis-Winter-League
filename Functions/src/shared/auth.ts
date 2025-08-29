/**
 * Authentication utilities for Firebase Functions
 */

import { CallableRequest } from 'firebase-functions/v2/https'
import { Firestore } from 'firebase-admin/firestore'

/**
 * Validates that a user is authenticated and has a verified email
 */
export function validateAuthentication(auth: CallableRequest['auth']): void {
	if (!auth?.uid) {
		throw new Error('Authentication required')
	}

	if (!auth.token?.email_verified) {
		throw new Error('Email verification required')
	}
}

/**
 * Validates that a user is an admin
 */
export async function validateAdminUser(
	auth: CallableRequest['auth'],
	firestore: Firestore
): Promise<void> {
	validateAuthentication(auth)

	if (!auth?.uid) {
		throw new Error('Authentication required')
	}

	const userDoc = await firestore.collection('players').doc(auth.uid).get()

	if (!userDoc.exists || !userDoc.data()?.admin) {
		throw new Error('Admin privileges required')
	}
}
