/**
 * Authentication utilities for Firebase Functions
 */

import { CallableRequest } from 'firebase-functions/v2/https'
import { Firestore } from 'firebase-admin/firestore'
import { PlayerDocument } from '../types.js'

/**
 * Validates that a user is authenticated and has a verified email
 * Use this for most functions where email verification is required
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
 * Validates that a user is authenticated (without requiring email verification)
 * Use this for functions that need to work immediately after user creation,
 * such as creating a player profile for a newly registered user
 */
export function validateBasicAuthentication(
	auth: CallableRequest['auth']
): void {
	if (!auth?.uid) {
		throw new Error('Authentication required')
	}

	// Note: We don't check email_verified here to allow newly created users
	// to create their player profiles before email verification
}

/**
 * Validates that a user is an admin
 * @returns The validated user ID (never null after this returns)
 */
export async function validateAdminUser(
	auth: CallableRequest['auth'],
	firestore: Firestore
): Promise<string> {
	validateAuthentication(auth)

	if (!auth?.uid) {
		throw new Error('Authentication required')
	}

	const userDoc = await firestore.collection('players').doc(auth.uid).get()

	if (
		!userDoc.exists ||
		!(userDoc.data() as PlayerDocument | undefined)?.admin
	) {
		throw new Error('Admin privileges required')
	}

	return auth.uid
}
