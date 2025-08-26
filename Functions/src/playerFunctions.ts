/**
 * Firebase Functions for Player operations
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { PlayerDocument, Collections } from '@minneapolis-winter-league/shared'

const firestore = getFirestore()

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
		if (!auth || !auth.uid) {
			logger.warn('Unauthenticated createPlayer attempt')
			throw new HttpsError(
				'unauthenticated',
				'User must be authenticated to create a player profile'
			)
		}

		// Validate and extract request data
		const { firstname, lastname, email, seasonId } = data

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

		if (!seasonId || typeof seasonId !== 'string') {
			throw new HttpsError(
				'invalid-argument',
				'Season ID is required and must be a string'
			)
		}

		// Validate email matches authenticated user
		if (auth.token.email !== email) {
			logger.warn('Email mismatch in createPlayer', {
				authEmail: auth.token.email,
				requestEmail: email,
				uid: auth.uid,
			})
			throw new HttpsError(
				'invalid-argument',
				"Email must match authenticated user's email address"
			)
		}

		// Trim whitespace from names
		const trimmedFirstname = firstname.trim()
		const trimmedLastname = lastname.trim()

		try {
			// Verify season exists
			const seasonRef = firestore.collection(Collections.SEASONS).doc(seasonId)

			const seasonDoc = await seasonRef.get()
			if (!seasonDoc.exists) {
				throw new HttpsError(
					'not-found',
					`Season with ID ${seasonId} does not exist`
				)
			}

			// Check if player document already exists
			const playerRef = firestore.collection(Collections.PLAYERS).doc(auth.uid)

			const existingPlayer = await playerRef.get()
			if (existingPlayer.exists) {
				throw new HttpsError(
					'already-exists',
					'Player profile already exists for this user'
				)
			}

			// Create player data with all required fields
			const playerData: PlayerDocument = {
				admin: false, // Always false for new players - security requirement
				email: email,
				firstname: trimmedFirstname,
				lastname: trimmedLastname,
				seasons: [
					{
						banned: false,
						captain: false,
						paid: false,
						season: seasonRef as any, // Firebase Admin uses different types
						signed: false,
						team: null, // New players start without a team
					},
				],
			}

			// Create the player document using the authenticated user's UID as document ID
			await playerRef.set(playerData)

			logger.info('Player created successfully', {
				playerId: auth.uid,
				email: email,
				name: `${trimmedFirstname} ${trimmedLastname}`,
				seasonId: seasonId,
			})

			return {
				success: true,
				playerId: auth.uid,
				message: 'Player profile created successfully',
			}
		} catch (error) {
			// Re-throw HttpsErrors as-is
			if (error instanceof HttpsError) {
				throw error
			}

			// Log unexpected errors
			logger.error('Error creating player:', {
				error: error,
				uid: auth.uid,
				email: email,
			})

			throw new HttpsError(
				'internal',
				'Failed to create player profile. Please try again.'
			)
		}
	}
)

//////////////////////////////////////////////////////////////////////////////
// PLAYER UPDATE
//////////////////////////////////////////////////////////////////////////////

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
		if (!auth || !auth.uid) {
			logger.warn('Unauthenticated updatePlayer attempt')
			throw new HttpsError(
				'unauthenticated',
				'User must be authenticated to update a player profile'
			)
		}

		const { playerId, firstname, lastname } = data

		// Determine target player ID (defaults to authenticated user)
		const targetPlayerId = playerId || auth.uid

		// Check if user is trying to update someone else's profile
		if (targetPlayerId !== auth.uid) {
			// Check if user is admin
			try {
				const authPlayerRef = firestore
					.collection(Collections.PLAYERS)
					.doc(auth.uid)

				const authPlayerDoc = await authPlayerRef.get()
				const isAdmin =
					authPlayerDoc.exists && authPlayerDoc.data()?.admin === true

				if (!isAdmin) {
					throw new HttpsError(
						'permission-denied',
						"Only admins can update other players' profiles"
					)
				}
			} catch (error) {
				if (error instanceof HttpsError) throw error
				throw new HttpsError('internal', 'Failed to verify admin permissions')
			}
		}

		// Validate that at least one field is being updated
		if (!firstname && !lastname) {
			throw new HttpsError(
				'invalid-argument',
				'At least one field (firstname or lastname) must be provided for update'
			)
		}

		// Validate field values if provided
		if (
			firstname !== undefined &&
			(typeof firstname !== 'string' || firstname.trim() === '')
		) {
			throw new HttpsError(
				'invalid-argument',
				'First name must be a non-empty string'
			)
		}

		if (
			lastname !== undefined &&
			(typeof lastname !== 'string' || lastname.trim() === '')
		) {
			throw new HttpsError(
				'invalid-argument',
				'Last name must be a non-empty string'
			)
		}

		try {
			// Check if target player exists
			const playerRef = firestore
				.collection(Collections.PLAYERS)
				.doc(targetPlayerId)

			const playerDoc = await playerRef.get()
			if (!playerDoc.exists) {
				throw new HttpsError(
					'not-found',
					`Player with ID ${targetPlayerId} does not exist`
				)
			}

			// Prepare update data (only include defined fields)
			const updateData: Partial<PlayerDocument> = {}
			if (firstname !== undefined) {
				updateData.firstname = firstname.trim()
			}
			if (lastname !== undefined) {
				updateData.lastname = lastname.trim()
			}

			// Update the player document
			await playerRef.update(updateData)

			logger.info('Player updated successfully', {
				playerId: targetPlayerId,
				updatedBy: auth.uid,
				updatedFields: Object.keys(updateData),
			})

			return {
				success: true,
				playerId: targetPlayerId,
				message: 'Player profile updated successfully',
			}
		} catch (error) {
			// Re-throw HttpsErrors as-is
			if (error instanceof HttpsError) {
				throw error
			}

			// Log unexpected errors
			logger.error('Error updating player:', {
				error: error,
				targetPlayerId: targetPlayerId,
				updatedBy: auth.uid,
			})

			throw new HttpsError(
				'internal',
				'Failed to update player profile. Please try again.'
			)
		}
	}
)

//////////////////////////////////////////////////////////////////////////////
// PLAYER DELETE
//////////////////////////////////////////////////////////////////////////////

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
		if (!auth || !auth.uid) {
			logger.warn('Unauthenticated deletePlayer attempt')
			throw new HttpsError(
				'unauthenticated',
				'User must be authenticated to delete a player profile'
			)
		}

		const { playerId, adminOverride = false } = data

		// Determine target player ID (defaults to authenticated user)
		const targetPlayerId = playerId || auth.uid

		// Check if user is trying to delete someone else's profile
		let isAdmin = false
		if (targetPlayerId !== auth.uid) {
			try {
				const authPlayerRef = firestore
					.collection(Collections.PLAYERS)
					.doc(auth.uid)

				const authPlayerDoc = await authPlayerRef.get()
				isAdmin = authPlayerDoc.exists && authPlayerDoc.data()?.admin === true

				if (!isAdmin) {
					throw new HttpsError(
						'permission-denied',
						"Only admins can delete other players' profiles"
					)
				}

				if (!adminOverride) {
					throw new HttpsError(
						'failed-precondition',
						'Admin must set adminOverride flag to delete other players'
					)
				}
			} catch (error) {
				if (error instanceof HttpsError) throw error
				throw new HttpsError('internal', 'Failed to verify admin permissions')
			}
		}

		try {
			// Check if target player exists
			const playerRef = firestore
				.collection(Collections.PLAYERS)
				.doc(targetPlayerId)

			const playerDoc = await playerRef.get()
			if (!playerDoc.exists) {
				throw new HttpsError(
					'not-found',
					`Player with ID ${targetPlayerId} does not exist`
				)
			}

			const playerData = playerDoc.data() as PlayerDocument

			// Check for active team associations
			const activeTeams =
				playerData.seasons?.filter((season) => season.team !== null) || []
			if (activeTeams.length > 0 && !adminOverride) {
				throw new HttpsError(
					'failed-precondition',
					'Player is associated with active teams. Remove from teams first or use admin override.'
				)
			}

			// Log deletion for audit trail
			logger.warn('Player deletion initiated', {
				deletedPlayerId: targetPlayerId,
				deletedBy: auth.uid,
				isAdmin: isAdmin,
				adminOverride: adminOverride,
				playerEmail: playerData.email,
				playerName: `${playerData.firstname} ${playerData.lastname}`,
				activeTeamsCount: activeTeams.length,
			})

			// Delete the player document
			await playerRef.delete()

			logger.info('Player deleted successfully', {
				deletedPlayerId: targetPlayerId,
				deletedBy: auth.uid,
			})

			return {
				success: true,
				playerId: targetPlayerId,
				message: 'Player profile deleted successfully',
				warnings:
					activeTeams.length > 0
						? ['Player had active team associations that may need cleanup']
						: [],
			}
		} catch (error) {
			// Re-throw HttpsErrors as-is
			if (error instanceof HttpsError) {
				throw error
			}

			// Log unexpected errors
			logger.error('Error deleting player:', {
				error: error,
				targetPlayerId: targetPlayerId,
				deletedBy: auth.uid,
			})

			throw new HttpsError(
				'internal',
				'Failed to delete player profile. Please try again.'
			)
		}
	}
)
