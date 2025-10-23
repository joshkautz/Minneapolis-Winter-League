/**
 * Update player callable function
 */

import { getFirestore } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions/v1'
import { Collections } from '../../../types.js'
import {
	validateAdminUser,
	validateBasicAuthentication,
} from '../../../shared/auth.js'
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
export const updatePlayer = functions
	.region(FIREBASE_CONFIG.REGION)
	.https.onCall(
		async (
			data: UpdatePlayerRequest,
			context: functions.https.CallableContext
		) => {
			const { auth } = context

			// Validate authentication
			validateBasicAuthentication(auth)

			const { playerId, firstname, lastname } = data

			// Determine target player ID (defaults to authenticated user)
			const targetPlayerId = playerId || auth!.uid

			// Check if user is trying to update someone else's profile
			if (targetPlayerId !== auth!.uid) {
				// Only admins can update other players
				const firestore = getFirestore()
				await validateAdminUser(auth, firestore)
			}

			// Validate that at least one field is being updated
			if (!firstname && !lastname) {
				throw new functions.https.HttpsError(
					'invalid-argument',
					'At least one field must be provided for update'
				)
			}

			// Validate field values if provided
			if (
				firstname !== undefined &&
				(typeof firstname !== 'string' || firstname.trim() === '')
			) {
				throw new functions.https.HttpsError(
					'invalid-argument',
					'First name must be a non-empty string'
				)
			}

			if (
				lastname !== undefined &&
				(typeof lastname !== 'string' || lastname.trim() === '')
			) {
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Last name must be a non-empty string'
				)
			}

			try {
				const firestore = getFirestore()
				const playerRef = firestore
					.collection(Collections.PLAYERS)
					.doc(targetPlayerId)

				// Check if player exists
				const playerDoc = await playerRef.get()
				if (!playerDoc.exists) {
					throw new functions.https.HttpsError('not-found', 'Player not found')
				}

				// Build update data
				const updateData: Record<string, unknown> = {}
				if (firstname !== undefined) {
					updateData.firstname = firstname.trim()
				}
				if (lastname !== undefined) {
					updateData.lastname = lastname.trim()
				}

				// Update the player document
				await playerRef.update(updateData)

				functions.logger.info(
					`Successfully updated player: ${targetPlayerId}`,
					{
						updatedFields: Object.keys(updateData),
						updatedBy: auth!.uid,
					}
				)

				return {
					success: true,
					playerId: targetPlayerId,
					message: 'Player updated successfully',
				}
			} catch (error) {
				functions.logger.error('Error updating player:', {
					targetPlayerId,
					updatedBy: auth!.uid,
					error: error instanceof Error ? error.message : 'Unknown error',
				})

				// Re-throw HttpsError as-is, wrap other errors
				if (error instanceof functions.https.HttpsError) {
					throw error
				}

				throw new functions.https.HttpsError(
					'internal',
					error instanceof Error ? error.message : 'Failed to update player'
				)
			}
		}
	)
