/**
 * Create player callable function
 */

import { getFirestore, DocumentReference } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions/v1'
import { Collections, PlayerDocument, SeasonDocument } from '../../types.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'
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
 * Creates a new player document in Firestore
 *
 * Security validations performed:
 * - User must be authenticated (but email verification is NOT required)
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
 * Note: Email verification is NOT required to allow newly registered users
 * to create their player profiles immediately after account creation.
 */
export const createPlayer = functions
	.region(FIREBASE_CONFIG.REGION)
	.https.onCall(
		async (
			data: CreatePlayerRequest,
			context: functions.https.CallableContext
		) => {
			// Validate authentication
			validateBasicAuthentication(context.auth)

			const { firstname, lastname, email, seasonId } = data
			const userId = context.auth!.uid

			// Validate required fields
			if (
				!firstname ||
				typeof firstname !== 'string' ||
				firstname.trim() === ''
			) {
				throw new functions.https.HttpsError(
					'invalid-argument',
					'First name is required and must be a non-empty string'
				)
			}

			if (!lastname || typeof lastname !== 'string' || lastname.trim() === '') {
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Last name is required and must be a non-empty string'
				)
			}

			if (!email || typeof email !== 'string') {
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Email is required and must be a string'
				)
			}

			if (!seasonId || typeof seasonId !== 'string') {
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Season ID is required and must be a string'
				)
			}

			// Validate email matches authenticated user
			if (context.auth!.token.email !== email) {
				throw new functions.https.HttpsError(
					'permission-denied',
					'Email must match authenticated user email'
				)
			}

			// Trim whitespace from names
			const trimmedFirstname = firstname.trim()
			const trimmedLastname = lastname.trim()

			try {
				const firestore = getFirestore()

				// Check if player already exists
				const existingPlayer = await firestore
					.collection(Collections.PLAYERS)
					.doc(userId)
					.get()

				if (existingPlayer.exists) {
					throw new functions.https.HttpsError(
						'already-exists',
						'Player already exists'
					)
				}

				// Validate season exists
				const seasonRef = firestore
					.collection(Collections.SEASONS)
					.doc(seasonId) as DocumentReference<SeasonDocument>
				const seasonDoc = await seasonRef.get()

				if (!seasonDoc.exists) {
					throw new functions.https.HttpsError('not-found', 'Invalid season ID')
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
							lookingForTeam: false,
							locked: false,
						},
					],
				}

				await firestore.collection(Collections.PLAYERS).doc(userId).set(player)

				functions.logger.info(`Successfully created player: ${userId}`, {
					email,
					name: `${trimmedFirstname} ${trimmedLastname}`,
				})

				return {
					success: true,
					playerId: userId,
					message: 'Player created successfully',
				}
			} catch (error) {
				functions.logger.error('Error creating player:', {
					userId,
					email,
					error: error instanceof Error ? error.message : 'Unknown error',
				})

				// Re-throw HttpsError as-is, wrap other errors
				if (error instanceof functions.https.HttpsError) {
					throw error
				}

				throw new functions.https.HttpsError(
					'internal',
					error instanceof Error ? error.message : 'Failed to create player'
				)
			}
		}
	)
