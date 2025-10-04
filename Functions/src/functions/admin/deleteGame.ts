/**
 * Delete game callable function (Admin only)
 *
 * This function is only invoked via the Admin Dashboard.
 * It deletes a game from the current season.
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, GameDocument } from '../../types.js'
import { validateAdminUser } from '../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'

/**
 * Request interface
 */
interface DeleteGameRequest {
	/** The game ID to delete */
	gameId: string
}

/**
 * Response interface for deleting a game
 */
interface DeleteGameResponse {
	success: boolean
	message: string
	/** ID of the deleted game */
	gameId: string
}

/**
 * Deletes a game from the system
 *
 * Security validations performed:
 * - User must be authenticated with verified email
 * - User must have admin privileges
 * - Game must exist
 *
 * @returns {DeleteGameResponse} Response containing success status and deleted game info
 */
export const deleteGame = onCall<DeleteGameRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<DeleteGameResponse> => {
		try {
			const { auth: authContext, data } = request
			const firestore = getFirestore()

			// Validate admin authentication
			await validateAdminUser(authContext, firestore)

			const { gameId } = data

			if (!gameId) {
				throw new Error('Game ID is required')
			}

			// Get game document
			const gameRef = firestore.collection(Collections.GAMES).doc(gameId)
			const gameDoc = await gameRef.get()

			if (!gameDoc.exists) {
				throw new Error('Game not found')
			}

			const gameDocument = gameDoc.data() as GameDocument | undefined

			if (!gameDocument) {
				throw new Error('Unable to retrieve game data')
			}

			// Delete the game
			await gameRef.delete()

			logger.info('Game deleted successfully', {
				gameId,
				field: gameDocument.field,
				timestamp: gameDocument.date,
			})

			return {
				success: true,
				message: 'Game deleted successfully',
				gameId,
			}
		} catch (error) {
			logger.error('Error deleting game', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			})

			if (error instanceof Error) {
				throw error
			}

			throw new Error('Failed to delete game')
		}
	}
)
