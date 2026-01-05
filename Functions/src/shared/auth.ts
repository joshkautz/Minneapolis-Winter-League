/**
 * Authentication utilities for Firebase Functions
 */

import { CallableRequest, HttpsError } from 'firebase-functions/v2/https'
import { Firestore } from 'firebase-admin/firestore'
import { PlayerDocument, PlayerSeason } from '../types.js'

/**
 * Validates that a user is authenticated and has a verified email
 * Use this for most functions where email verification is required
 */
export function validateAuthentication(auth: CallableRequest['auth']): void {
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
): void {
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
 * Validates that a player is not banned for a specific season
 *
 * @param playerData - The player document data
 * @param seasonId - The season ID to check banned status for
 * @throws HttpsError with 'permission-denied' if player is banned
 *
 * @example
 * ```ts
 * const playerData = playerDoc.data() as PlayerDocument
 * validateNotBanned(playerData, seasonId)
 * ```
 */
export function validateNotBanned(
	playerData: PlayerDocument | undefined,
	seasonId: string
): void {
	if (!playerData) {
		throw new HttpsError('not-found', 'Player not found')
	}

	const seasonData = playerData.seasons?.find(
		(s: PlayerSeason) => s.season.id === seasonId
	)

	if (seasonData?.banned) {
		throw new HttpsError(
			'permission-denied',
			'Account is banned from this season'
		)
	}
}

/**
 * Checks if a player is banned for a specific season (non-throwing version)
 *
 * @param playerData - The player document data
 * @param seasonId - The season ID to check banned status for
 * @returns true if the player is banned, false otherwise
 *
 * @example
 * ```ts
 * const playerData = playerDoc.data() as PlayerDocument
 * if (isPlayerBanned(playerData, seasonId)) {
 *   // Handle banned case
 * }
 * ```
 */
export function isPlayerBanned(
	playerData: PlayerDocument | undefined,
	seasonId: string
): boolean {
	if (!playerData) {
		return false
	}

	const seasonData = playerData.seasons?.find(
		(s: PlayerSeason) => s.season.id === seasonId
	)

	return seasonData?.banned === true
}
