/**
 * Create player callable function
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	PLAYER_SEASONS_SUBCOLLECTION,
	PlayerDocument,
	PlayerSeasonDocument,
	SeasonDocument,
} from '../../../types.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { validateBasicAuthentication } from '../../../shared/auth.js'

/**
 * Request interface for creating a player
 */
interface CreatePlayerRequest {
	firstname: string
	lastname: string
	email: string
}

/**
 * Creates a new player document in Firestore
 *
 * Security validations performed:
 * - User must be authenticated (but email verification is NOT required)
 * - Email must match authenticated user's email (explicitly validated)
 * - All required PlayerDocument fields must be provided (validated)
 * - Player document must not already exist (validated)
 *
 * Security features provided:
 * - Document ID is automatically set to authenticated user's UID (prevents impersonation)
 * - Admin field is automatically set to false (prevents privilege escalation)
 * - All input is sanitized and validated server-side (prevents malicious data)
 *
 * Season handling:
 * - Automatically adds all seasons where registration is still open (registrationEnd > now)
 * - If no seasons have open registration, player is created with empty seasons array
 * - Player will receive future seasons when they are created by admins
 *
 * Note: Email verification is NOT required to allow newly registered users
 * to create their player profiles immediately after account creation.
 */
export const createPlayer = onCall<CreatePlayerRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { auth, data } = request

		// Validate authentication
		validateBasicAuthentication(auth)

		const { firstname, lastname, email } = data
		const userId = auth?.uid ?? ''

		// Validate required fields
		if (
			!firstname ||
			typeof firstname !== 'string' ||
			firstname.trim() === ''
		) {
			throw new HttpsError(
				'invalid-argument',
				'First name is required and must be a non-empty string'
			)
		}

		if (!lastname || typeof lastname !== 'string' || lastname.trim() === '') {
			throw new HttpsError(
				'invalid-argument',
				'Last name is required and must be a non-empty string'
			)
		}

		if (!email || typeof email !== 'string') {
			throw new HttpsError(
				'invalid-argument',
				'Email is required and must be a string'
			)
		}

		// Validate email matches authenticated user
		if (auth?.token.email !== email) {
			throw new HttpsError(
				'permission-denied',
				'Email must match authenticated user email'
			)
		}

		// Trim whitespace from names
		const trimmedFirstname = firstname.trim()
		const trimmedLastname = lastname.trim()

		try {
			const firestore = getFirestore()
			const playerRef = firestore.collection(Collections.PLAYERS).doc(userId)

			// Check if player already exists
			const playerDoc = await playerRef.get()
			if (playerDoc.exists) {
				throw new HttpsError('already-exists', 'Player already exists')
			}

			// Find all seasons where registration is still open (registrationEnd > now)
			const now = Timestamp.now()
			const seasonsSnapshot = await firestore
				.collection(Collections.SEASONS)
				.where('registrationEnd', '>', now)
				.get()

			// Create player parent doc + season subdoc per open-registration season,
			// all in a single batched write.
			const player: PlayerDocument = {
				admin: false,
				email: email,
				firstname: trimmedFirstname,
				lastname: trimmedLastname,
				createdAt: Timestamp.now(),
			}

			const batch = firestore.batch()
			batch.set(playerRef, player)
			for (const seasonDoc of seasonsSnapshot.docs) {
				const seasonSubRef = playerRef
					.collection(PLAYER_SEASONS_SUBCOLLECTION)
					.doc(seasonDoc.id)
				const seasonData: PlayerSeasonDocument = {
					season:
						seasonDoc.ref as FirebaseFirestore.DocumentReference<SeasonDocument>,
					team: null,
					paid: false,
					signed: false,
					banned: false,
					captain: false,
				}
				batch.set(seasonSubRef, seasonData)
			}
			await batch.commit()

			logger.info(`Successfully created player: ${userId}`, {
				email,
				name: `${trimmedFirstname} ${trimmedLastname}`,
				seasonsAdded: seasonsSnapshot.size,
				seasonIds: seasonsSnapshot.docs.map((d) => d.id),
			})

			return {
				success: true,
				playerId: userId,
				message:
					seasonsSnapshot.size > 0
						? `Player created successfully with ${seasonsSnapshot.size} active season(s)`
						: 'Player created successfully (no active seasons currently)',
			}
		} catch (error) {
			logger.error('Error creating player:', {
				userId,
				email,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			// Re-throw HttpsError as-is, wrap other errors
			if (error instanceof HttpsError) {
				throw error
			}

			throw new HttpsError(
				'internal',
				error instanceof Error ? error.message : 'Failed to create player'
			)
		}
	}
)
