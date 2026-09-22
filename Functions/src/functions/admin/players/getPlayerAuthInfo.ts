/**
 * Get player Firebase Auth info (admin) callable function
 *
 * Returns Firebase Authentication information for a player,
 * including email verification status.
 */

import { getAuth } from 'firebase-admin/auth'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { validateAdminUser } from '../../../shared/auth.js'
import { getFirestore } from 'firebase-admin/firestore'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface GetPlayerAuthInfoRequest {
	/** Player's Firebase Auth UID */
	playerId: string
}

interface GetPlayerAuthInfoResponse {
	success: true
	playerId: string
	/**
	 * Whether a Firebase Auth user exists for this player at all.
	 *
	 * A player document can outlive its Auth account — someone removed from
	 * Authentication keeps their Firestore record, their roster entries and
	 * their history. Reporting that as `emailVerified: false` is misleading:
	 * there is no email to verify and no account to verify it against, and an
	 * admin toggling verification on such a player gets an opaque failure.
	 */
	hasAuthAccount: boolean
	/** Whether the user's email is verified. False when there is no account. */
	emailVerified: boolean
	/** The user's email address from Firebase Auth */
	email: string | undefined
}

/**
 * Gets Firebase Authentication info for a player
 *
 * Security validations:
 * - User must be authenticated
 * - User must have admin privileges
 *
 * A missing Auth user is reported as `hasAuthAccount: false` rather than
 * raised as an error — it is a normal state for an old player record, and the
 * admin screen needs to show it rather than fail loading the player.
 */
export const getPlayerAuthInfo = onCall<
	GetPlayerAuthInfoRequest,
	Promise<GetPlayerAuthInfoResponse>
>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<GetPlayerAuthInfoResponse> => {
		const { auth, data } = request

		logger.info('getPlayerAuthInfo called', {
			adminUserId: auth?.uid,
			targetPlayerId: data.playerId,
		})

		// Validate admin authentication
		const firestore = getFirestore()
		await validateAdminUser(auth, firestore)

		const { playerId } = data

		// Validate required fields
		if (!playerId || typeof playerId !== 'string') {
			logger.warn('Invalid playerId provided', { playerId })
			throw new HttpsError(
				'invalid-argument',
				'Player ID is required and must be a valid string'
			)
		}

		try {
			const authInstance = getAuth()
			const userRecord = await authInstance.getUser(playerId)

			logger.info('Retrieved player auth info', {
				playerId,
				emailVerified: userRecord.emailVerified,
			})

			return {
				success: true,
				playerId,
				hasAuthAccount: true,
				emailVerified: userRecord.emailVerified,
				email: userRecord.email,
			}
		} catch (error) {
			logger.error('Error getting player auth info', {
				playerId,
				adminUserId: auth?.uid,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			// A player with no Auth account is a state to report, not a fault.
			if (error && typeof error === 'object' && 'code' in error) {
				const firebaseError = error as { code: string }
				if (firebaseError.code === 'auth/user-not-found') {
					logger.info('Player has no Firebase Auth account', { playerId })
					return {
						success: true,
						playerId,
						hasAuthAccount: false,
						emailVerified: false,
						email: undefined,
					}
				}
			}

			throw new HttpsError(
				'internal',
				error instanceof Error
					? error.message
					: 'Failed to get player auth info.'
			)
		}
	}
)
