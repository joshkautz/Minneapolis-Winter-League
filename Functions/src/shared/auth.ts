/**
 * Authentication utilities for Firebase Functions
 */

import { CallableRequest, HttpsError } from 'firebase-functions/v2/https'
import { Firestore } from 'firebase-admin/firestore'
import {
	Collections,
	PLAYER_SEASONS_SUBCOLLECTION,
	PlayerDocument,
} from '../types.js'
import { getPlayerSeason } from './database.js'

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
 * A ban is a fact about a person, so the answer lives on the player document.
 * While the backfill is outstanding, a player document with no `banned` field
 * has not been migrated yet, and the answer comes from their season subdocs
 * instead — banned in **any** season means banned, which is what the three
 * carry-forward sites already assumed.
 *
 * Reading the per-season flag directly is what made a ban impossible to lift:
 * clearing one season left the others set and the next carry-forward
 * reinstated it. Nothing outside this module should read it.
 *
 * `seasonId` is optional and only an optimisation: when the caller knows
 * which season they are asking about, the fallback checks that subdoc first
 * as a single read before widening to a query over all of them.
 */
export async function isPlayerBanned(
	firestore: Firestore,
	playerId: string,
	seasonId?: string
): Promise<boolean> {
	const playerSnapshot = await firestore
		.collection(Collections.PLAYERS)
		.doc(playerId)
		.get()
	const playerData = playerSnapshot.data() as PlayerDocument | undefined

	if (typeof playerData?.banned === 'boolean') {
		return playerData.banned
	}

	// Not migrated yet. Check the season asked about first — it is one read
	// and covers the common case — then every other season the player has.
	if (seasonId) {
		const seasonData = await getPlayerSeason(firestore, playerId, seasonId)
		if (seasonData?.banned === true) {
			return true
		}
	}

	const otherSeasons = await firestore
		.collection(Collections.PLAYERS)
		.doc(playerId)
		.collection(PLAYER_SEASONS_SUBCOLLECTION)
		.where('banned', '==', true)
		.limit(1)
		.get()

	return !otherSeasons.empty
}

/**
 * Validates that a player is not banned from the league.
 *
 * @throws HttpsError with 'permission-denied' if the player is banned
 */
export async function validateNotBanned(
	firestore: Firestore,
	playerId: string,
	seasonId: string
): Promise<void> {
	if (await isPlayerBanned(firestore, playerId, seasonId)) {
		throw new HttpsError(
			'permission-denied',
			'Account is banned from the league'
		)
	}
}
