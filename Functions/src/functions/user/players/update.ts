/**
 * Update player callable function
 */

import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { Collections } from '../../../types.js'
import {
	validateAdminUser,
	validateBasicAuthentication,
} from '../../../shared/auth.js'
import { validateAndNormalizeName } from '../../../shared/names.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

/**
 * Request interface for updating a player
 */
interface UpdatePlayerRequest {
	playerId?: string // Optional - defaults to authenticated user
	firstname?: string
	lastname?: string
	// Note: email updates not allowed for security
	// Note: admin updates not allowed for security
	// Note: seasons updates should go through dedicated functions
}

/**
 * Updates a player document in Firestore
 *
 * Security validations:
 * - User must be authenticated
 * - Users can only update their own profile (unless admin)
 * - Only safe fields can be updated (firstname, lastname)
 * - Email and admin status cannot be changed
 * - Seasons array requires dedicated functions
 */
export const updatePlayer = onCall<UpdatePlayerRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { auth, data } = request

		// Validate authentication
		validateBasicAuthentication(auth)

		const { playerId, firstname, lastname } = data
		const userId = auth?.uid ?? ''

		// Determine target player ID (defaults to authenticated user)
		const targetPlayerId = playerId || userId

		// Check if user is trying to update someone else's profile
		if (targetPlayerId !== userId) {
			// Only admins can update other players
			const firestore = getFirestore()
			await validateAdminUser(auth, firestore)
		}

		// Validate that at least one field is being updated
		if (!firstname && !lastname) {
			throw new HttpsError(
				'invalid-argument',
				'At least one field must be provided for update'
			)
		}

		// Validate and normalize the provided names. Same rules as the App's
		// nameSchema, enforced here because a callable bypasses the form.
		const normalizedFirstname =
			firstname !== undefined
				? validateAndNormalizeName(firstname, 'First name')
				: undefined
		const normalizedLastname =
			lastname !== undefined
				? validateAndNormalizeName(lastname, 'Last name')
				: undefined

		try {
			const firestore = getFirestore()
			const playerRef = firestore
				.collection(Collections.PLAYERS)
				.doc(targetPlayerId)

			// Build update data
			const updateData: Record<string, unknown> = {}
			if (normalizedFirstname !== undefined) {
				updateData.firstname = normalizedFirstname
			}
			if (normalizedLastname !== undefined) {
				updateData.lastname = normalizedLastname
			}

			// Use transaction to atomically verify existence and update
			await firestore.runTransaction(async (transaction) => {
				const playerDoc = await transaction.get(playerRef)
				if (!playerDoc.exists) {
					throw new HttpsError('not-found', 'Player not found')
				}

				transaction.update(playerRef, updateData)
			})

			logger.info(`Successfully updated player: ${targetPlayerId}`, {
				updatedFields: Object.keys(updateData),
				updatedBy: userId,
			})

			return {
				success: true,
				playerId: targetPlayerId,
				message: 'Player updated successfully',
			}
		} catch (error) {
			logger.error('Error updating player:', {
				targetPlayerId,
				updatedBy: userId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			// Re-throw HttpsError as-is, wrap other errors
			if (error instanceof HttpsError) {
				throw error
			}

			throw new HttpsError(
				'internal',
				error instanceof Error ? error.message : 'Failed to update player'
			)
		}
	}
)
