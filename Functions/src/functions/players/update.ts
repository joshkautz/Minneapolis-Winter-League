/**
 * Update player callable function
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections } from '../../types.js'
import { validateAuthentication, validateAdminUser } from '../../shared/auth.js'

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
	{ cors: true },
	async (request) => {
		const { data, auth } = request

		// Validate authentication
		validateAuthentication(auth)

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
			throw new Error('At least one field must be provided for update')
		}

		// Validate field values if provided
		if (
			firstname !== undefined &&
			(typeof firstname !== 'string' || firstname.trim() === '')
		) {
			throw new Error('First name must be a non-empty string')
		}

		if (
			lastname !== undefined &&
			(typeof lastname !== 'string' || lastname.trim() === '')
		) {
			throw new Error('Last name must be a non-empty string')
		}

		try {
			const firestore = getFirestore()
			const playerRef = firestore
				.collection(Collections.PLAYERS)
				.doc(targetPlayerId)

			// Check if player exists
			const playerDoc = await playerRef.get()
			if (!playerDoc.exists) {
				throw new Error('Player not found')
			}

			// Build update data
			const updateData: any = {}
			if (firstname !== undefined) {
				updateData.firstname = firstname.trim()
			}
			if (lastname !== undefined) {
				updateData.lastname = lastname.trim()
			}

			// Update the player document
			await playerRef.update(updateData)

			logger.info(`Successfully updated player: ${targetPlayerId}`, {
				updatedFields: Object.keys(updateData),
				updatedBy: auth!.uid,
			})

			return {
				success: true,
				playerId: targetPlayerId,
				message: 'Player updated successfully',
			}
		} catch (error) {
			logger.error('Error updating player:', {
				targetPlayerId,
				updatedBy: auth!.uid,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new Error(
				error instanceof Error ? error.message : 'Failed to update player'
			)
		}
	}
)
