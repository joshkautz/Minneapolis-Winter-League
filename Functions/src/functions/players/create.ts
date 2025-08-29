/**
 * Create player callable function
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerDocument } from '../../types.js'
import { validateAuthentication } from '../../shared/auth.js'

/**
 * Request interface for creating a player
 */
interface CreatePlayerRequest {
	firstname: string
	lastname: string
	email: string
	seasonId: string
}

/**
 * Creates a new player document in Firestore
 *
 * Security validations:
 * - User must be authenticated
 * - Email must match authenticated user's email
 * - Document ID must match authenticated user's UID
 * - Admin field is automatically set to false
 * - All required PlayerDocument fields must be provided
 * - Season must exist and be valid
 */
export const createPlayer = onCall<CreatePlayerRequest>(
	{ cors: true },
	async (request) => {
		const { data, auth } = request

		// Validate authentication
		validateAuthentication(auth)

		// Validate and extract request data
		const { firstname, lastname, email, seasonId } = data

		// Validate required fields
		if (
			!firstname ||
			typeof firstname !== 'string' ||
			firstname.trim() === ''
		) {
			throw new Error('First name is required and must be a non-empty string')
		}

		if (!lastname || typeof lastname !== 'string' || lastname.trim() === '') {
			throw new Error('Last name is required and must be a non-empty string')
		}

		if (!email || typeof email !== 'string') {
			throw new Error('Email is required and must be a string')
		}

		if (!seasonId || typeof seasonId !== 'string') {
			throw new Error('Season ID is required and must be a string')
		}

		// Validate email matches authenticated user
		if (auth!.token.email !== email) {
			throw new Error('Email must match authenticated user email')
		}

		// Trim whitespace from names
		const trimmedFirstname = firstname.trim()
		const trimmedLastname = lastname.trim()

		try {
			const firestore = getFirestore()
			const playerId = auth!.uid

			// Check if player already exists
			const existingPlayer = await firestore
				.collection(Collections.PLAYERS)
				.doc(playerId)
				.get()

			if (existingPlayer.exists) {
				throw new Error('Player already exists')
			}

			// Validate season exists
			const seasonRef = firestore.collection(Collections.SEASONS).doc(seasonId)
			const seasonDoc = await seasonRef.get()

			if (!seasonDoc.exists) {
				throw new Error('Invalid season ID')
			}

			// Create player document
			const player: PlayerDocument = {
				firstname: trimmedFirstname,
				lastname: trimmedLastname,
				email: email,
				admin: false,
				seasons: [
					{
						season: seasonRef as any,
						team: null,
						captain: false,
						paid: false,
						signed: false,
						banned: false,
					},
				],
			}

			await firestore.collection(Collections.PLAYERS).doc(playerId).set(player)

			logger.info(`Successfully created player: ${playerId}`, {
				email,
				name: `${trimmedFirstname} ${trimmedLastname}`,
			})

			return {
				success: true,
				playerId,
				message: 'Player created successfully',
			}
		} catch (error) {
			logger.error('Error creating player:', {
				uid: auth!.uid,
				email,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new Error(
				error instanceof Error ? error.message : 'Failed to create player'
			)
		}
	}
)
