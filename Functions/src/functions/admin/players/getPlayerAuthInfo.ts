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
	/** Whether the user's email is verified */
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
 * - Target player must exist in Firebase Auth
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
				emailVerified: userRecord.emailVerified,
				email: userRecord.email,
			}
		} catch (error) {
			logger.error('Error getting player auth info', {
				playerId,
				adminUserId: auth?.uid,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			// Handle user not found
			if (error && typeof error === 'object' && 'code' in error) {
				const firebaseError = error as { code: string }
				if (firebaseError.code === 'auth/user-not-found') {
					throw new HttpsError(
						'not-found',
						'User not found in Firebase Authentication.'
					)
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
