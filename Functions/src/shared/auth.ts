/**
 * Authentication utilities for Firebase Functions
 */

import { CallableRequest, HttpsError } from 'firebase-functions/v2/https'
import { Firestore } from 'firebase-admin/firestore'
import { Collections, PlayerDocument } from '../types.js'

/**
 * Validates that a user is authenticated and has a verified email
 * Use this for most functions where email verification is required
 *
 * Uses an assertion signature so TypeScript narrows `auth` from
 * `AuthData | undefined` to `AuthData` for the rest of the calling scope.
 */
export function validateAuthentication(
	auth: CallableRequest['auth']
): asserts auth is NonNullable<CallableRequest['auth']> {
	if (!auth?.uid) {
		throw new HttpsError('unauthenticated', 'Authentication required')
	}

	if (!auth.token?.email_verified) {
		throw new HttpsError(
			'permission-denied',
			'Email verification required. Please verify your email address to continue.'
		)
	}
}

/**
 * Validates that a user is authenticated (without requiring email verification)
 * Use this for functions that need to work immediately after user creation,
 * such as creating a player profile for a newly registered user
 */
export function validateBasicAuthentication(
	auth: CallableRequest['auth']
): asserts auth is NonNullable<CallableRequest['auth']> {
	if (!auth?.uid) {
		throw new HttpsError('unauthenticated', 'Authentication required')
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
		throw new HttpsError('unauthenticated', 'Authentication required')
	}

	const userDoc = await firestore.collection('players').doc(auth.uid).get()

	if (
		!userDoc.exists ||
		!(userDoc.data() as PlayerDocument | undefined)?.admin
	) {
		throw new HttpsError(
			'permission-denied',
			'Admin privileges required to perform this action'
		)
	}

	return auth.uid
}

/**
 * Whether a player is banned from the league.
 *
 * A ban is a fact about a person, so it lives on the player document. It used
 * to live on each season subdoc, with `createSeason`, `createTeam` and
 * `rolloverTeam` copying it forward onto every new one — which made it
 * account-level in effect but impossible to lift, since clearing one season
 * left the others set and the next carry-forward reinstated it.
 *
 * A player document with no `banned` field is not banned. That is only safe
 * because the backfill has run over every player; before it had, an absent
 * field meant "ask the seasons".
 */
export async function isPlayerBanned(
	firestore: Firestore,
	playerId: string
): Promise<boolean> {
	const playerSnapshot = await firestore
		.collection(Collections.PLAYERS)
		.doc(playerId)
		.get()
	const playerData = playerSnapshot.data() as PlayerDocument | undefined

	return playerData?.banned === true
}

/**
 * Validates that a player is not banned from the league.
 *
 * @throws HttpsError with 'permission-denied' if the player is banned
 */
export async function validateNotBanned(
	firestore: Firestore,
	playerId: string
): Promise<void> {
	if (await isPlayerBanned(firestore, playerId)) {
		throw new HttpsError(
			'permission-denied',
			'Account is banned from the league'
		)
	}
}
