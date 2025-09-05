/**
 * Create player callable function
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore, DocumentReference } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerDocument, SeasonDocument } from '../../types.js'
import { validateBasicAuthentication } from '../../shared/auth.js'

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
 * Response interface for creating a player
 */
interface CreatePlayerResponse {
	success: boolean
	playerId: string
	message: string
}

/**
 * Creates a new player document in Firestore
 *
 * Security validations performed:
 * - User must be authenticated (but email verification is not required)
 * - Email must match authenticated user's email (explicitly validated)
 * - All required PlayerDocument fields must be provided (validated)
 * - Season must exist and be valid (validated)
 * - Player document must not already exist (validated)
 *
 * Security features provided:
 * - Document ID is automatically set to authenticated user's UID (prevents impersonation)
 * - Admin field is automatically set to false (prevents privilege escalation)
 * - All input is sanitized and validated server-side (prevents malicious data)
 *
 * Note: This function uses basic authentication validation (without email verification requirement)
 * to allow newly created users to create their player profiles immediately after registration.
 */
export const createPlayer = onCall<CreatePlayerRequest>(
	{ cors: true },
	async (request) => {
		const { data, auth } = request

		// Validate authentication (without requiring email verification for new users)
		validateBasicAuthentication(auth)

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
			const seasonRef = firestore
				.collection(Collections.SEASONS)
				.doc(seasonId) as DocumentReference<SeasonDocument>
			const seasonDoc = await seasonRef.get()

			if (!seasonDoc.exists) {
				throw new Error('Invalid season ID')
			}

			// Create player document
			const player: PlayerDocument = {
				admin: false,
				email: email,
				firstname: trimmedFirstname,
				lastname: trimmedLastname,
				seasons: [
					{
						banned: false,
						captain: false,
						paid: false,
						season: seasonRef,
						signed: false,
						team: null,
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
			} as CreatePlayerResponse
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Failed to create player'

			logger.error('Error creating player:', {
				uid: auth!.uid,
				email,
				error: errorMessage,
				stack: error instanceof Error ? error.stack : undefined,
			})

			// Throw a structured error with consistent messaging
			throw new Error(errorMessage)
		}
	}
)
