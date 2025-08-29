/**
 * Delete player callable function
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections } from '@minneapolis-winter-league/shared'
import { validateAuthentication, validateAdminUser } from '../../shared/auth.js'

/**
 * Request interface for deleting a player
 */
interface DeletePlayerRequest {
	playerId?: string // Optional - defaults to authenticated user
	adminOverride?: boolean // Allow admin to force delete
}

/**
 * Deletes a player document from Firestore
 *
 * Security validations:
 * - User must be authenticated
 * - Users can only delete their own profile (unless admin)
 * - Admins can delete any player with adminOverride flag
 * - Checks for team associations and warns about cleanup
 * - Provides audit logging for deletions
 */
export const deletePlayer = onCall<DeletePlayerRequest>(
	{ cors: true },
	async (request) => {
		const { data, auth } = request

		// Validate authentication
		validateAuthentication(auth)

		const { playerId, adminOverride } = data

		// Determine target player ID (defaults to authenticated user)
		const targetPlayerId = playerId || auth!.uid

		// Check if user is trying to delete someone else's profile
		if (targetPlayerId !== auth!.uid) {
			// Only admins can delete other players
			if (!adminOverride) {
				throw new Error('Admin override required to delete other players')
			}
			
			const firestore = getFirestore()
			await validateAdminUser(auth, firestore)
		}

		try {
			const firestore = getFirestore()
			const playerRef = firestore.collection(Collections.PLAYERS).doc(targetPlayerId)

			// Check if player exists
			const playerDoc = await playerRef.get()
			if (!playerDoc.exists) {
				throw new Error('Player not found')
			}

			const playerData = playerDoc.data()

			// Check for team associations
			const hasTeamAssociations = playerData?.seasons?.some((season: any) => season.team)
			
			if (hasTeamAssociations && !adminOverride) {
				throw new Error(
					'Player has team associations. Admin override required for deletion. ' +
					'Note: This will remove the player from all teams and delete all offers.'
				)
			}

			// Delete the player document
			// Note: The userDeleted trigger will handle cleanup of team rosters and offers
			await playerRef.delete()

			logger.info(`Successfully deleted player: ${targetPlayerId}`, {
				deletedBy: auth!.uid,
				playerData: {
					email: playerData?.email,
					name: `${playerData?.firstname} ${playerData?.lastname}`,
				},
				adminOverride,
			})

			return {
				success: true,
				playerId: targetPlayerId,
				message: 'Player deleted successfully',
			}
		} catch (error) {
			logger.error('Error deleting player:', {
				targetPlayerId,
				deletedBy: auth!.uid,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new Error(
				error instanceof Error ? error.message : 'Failed to delete player'
			)
		}
	}
)
