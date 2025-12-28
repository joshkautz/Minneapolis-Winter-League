/**
 * Delete player callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerSeason, PlayerDocument } from '../../../types.js'
import {
	validateAuthentication,
	validateAdminUser,
} from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

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
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { data, auth } = request

		// Validate authentication
		validateAuthentication(auth)

		const { playerId, adminOverride } = data
		const userId = auth?.uid ?? ''

		// Determine target player ID (defaults to authenticated user)
		const targetPlayerId = playerId || userId

		// Check if user is trying to delete someone else's profile
		if (targetPlayerId !== userId) {
			// Only admins can delete other players
			if (!adminOverride) {
				throw new HttpsError(
					'permission-denied',
					'Admin override required to delete other players'
				)
			}

			const firestore = getFirestore()
			await validateAdminUser(auth, firestore)
		}

		try {
			const firestore = getFirestore()
			const playerRef = firestore
				.collection(Collections.PLAYERS)
				.doc(targetPlayerId)

			// Use transaction to atomically verify and delete
			const playerDocument = await firestore.runTransaction(
				async (transaction) => {
					const playerDoc = await transaction.get(playerRef)

					if (!playerDoc.exists) {
						throw new HttpsError('not-found', 'Player not found')
					}

					const playerData = playerDoc.data() as PlayerDocument | undefined

					if (!playerData) {
						throw new HttpsError('not-found', 'Unable to retrieve player data')
					}

					// Check for team associations
					const hasTeamAssociations = playerData.seasons?.some(
						(season: PlayerSeason) => season.team
					)

					if (hasTeamAssociations && !adminOverride) {
						throw new HttpsError(
							'failed-precondition',
							'Player has team associations. Admin override required for deletion. ' +
								'Note: This will remove the player from all teams and delete all offers.'
						)
					}

					// Delete the player document
					// Note: The userDeleted trigger will handle cleanup of team rosters and offers
					transaction.delete(playerRef)

					return playerData
				}
			)

			logger.info(`Successfully deleted player: ${targetPlayerId}`, {
				deletedBy: userId,
				playerDocument: {
					email: playerDocument?.email,
					name: `${playerDocument?.firstname} ${playerDocument?.lastname}`,
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
				deletedBy: userId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			// Re-throw HttpsError as-is
			if (error instanceof HttpsError) {
				throw error
			}

			// Wrap other errors
			throw new HttpsError(
				'internal',
				error instanceof Error ? error.message : 'Failed to delete player'
			)
		}
	}
)
