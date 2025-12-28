/**
 * Update player email callable function
 *
 * This function allows admins to change a user's email address in Firebase Authentication.
 * The new email is automatically marked as verified.
 */

import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { Collections } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

/**
 * Request interface for updating a player's email
 */
interface UpdatePlayerEmailRequest {
	playerId: string // User ID whose email should be updated
	newEmail: string // New email address
}

/**
 * Response interface for successful email update
 */
interface UpdatePlayerEmailResponse {
	success: true
	playerId: string
	newEmail: string
	message: string
}

/**
 * Updates a player's email address in Firebase Authentication and Firestore
 *
 * Security validations:
 * - User must be authenticated with verified email
 * - User must have admin privileges (admin: true in player document)
 * - Target user must exist
 * - New email must be valid format
 * - New email must not already be in use
 *
 * After successful update:
 * - Email is marked as verified in Firebase Authentication
 * - Email is updated in the player's Firestore document
 * - Operation is logged for audit purposes
 */
export const updatePlayerEmail = onCall<
	UpdatePlayerEmailRequest,
	Promise<UpdatePlayerEmailResponse>
>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<UpdatePlayerEmailResponse> => {
		const { auth, data } = request

		logger.info('updatePlayerEmail called', {
			adminUserId: auth?.uid,
			targetPlayerId: data.playerId,
		})

		// Validate admin authentication
		const firestore = getFirestore()
		await validateAdminUser(auth, firestore)

		const { playerId, newEmail } = data

		// Validate required fields
		if (!playerId || typeof playerId !== 'string') {
			logger.warn('Invalid playerId provided', { playerId })
			throw new HttpsError(
				'invalid-argument',
				'Player ID is required and must be a valid string'
			)
		}

		if (!newEmail || typeof newEmail !== 'string') {
			logger.warn('Invalid newEmail provided', { newEmail })
			throw new HttpsError(
				'invalid-argument',
				'New email address is required and must be a valid string'
			)
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(newEmail.trim())) {
			logger.warn('Invalid email format provided', {
				newEmail: newEmail.trim(),
			})
			throw new HttpsError(
				'invalid-argument',
				'Invalid email format. Please provide a valid email address.'
			)
		}

		const trimmedNewEmail = newEmail.trim().toLowerCase()

		try {
			const firebaseAuth = getAuth()

			// Check if target user exists
			logger.info('Fetching target user from Authentication', {
				playerId,
			})
			let userRecord
			try {
				userRecord = await firebaseAuth.getUser(playerId)
			} catch (error) {
				logger.error('Target user not found in Authentication', {
					playerId,
					error: error instanceof Error ? error.message : 'Unknown error',
				})
				throw new HttpsError(
					'not-found',
					'User not found. Please verify the Player ID is correct.'
				)
			}

			const oldEmail = userRecord.email

			logger.info('Current user email retrieved', {
				playerId,
				oldEmail,
			})

			// Check if new email is the same as current email
			if (oldEmail?.toLowerCase() === trimmedNewEmail) {
				logger.warn('New email same as current email', {
					playerId,
					email: trimmedNewEmail,
				})
				throw new HttpsError(
					'invalid-argument',
					`User already has email address: ${trimmedNewEmail}`
				)
			}

			// Check if new email is already in use by another user
			logger.info('Checking if new email is already in use', {
				newEmail: trimmedNewEmail,
			})
			try {
				const existingUser = await firebaseAuth.getUserByEmail(trimmedNewEmail)
				if (existingUser.uid !== playerId) {
					logger.warn('Email already in use by another user', {
						newEmail: trimmedNewEmail,
						existingUserId: existingUser.uid,
						targetPlayerId: playerId,
					})
					throw new HttpsError(
						'already-exists',
						`Email address ${trimmedNewEmail} is already in use by another account.`
					)
				}
			} catch (error: unknown) {
				// If error is 'auth/user-not-found', that's good - email is available
				if (
					error &&
					typeof error === 'object' &&
					'code' in error &&
					error.code === 'auth/user-not-found'
				) {
					logger.info('New email is available', {
						newEmail: trimmedNewEmail,
					})
				} else {
					// Re-throw if it's our HttpsError from the duplicate check
					throw error
				}
			}

			// Update email in Firebase Authentication and mark as verified
			logger.info('Updating email in Firebase Authentication', {
				playerId,
				oldEmail,
				newEmail: trimmedNewEmail,
			})
			await firebaseAuth.updateUser(playerId, {
				email: trimmedNewEmail,
				emailVerified: true, // Mark email as verified
			})

			logger.info('Email successfully updated in Firebase Authentication', {
				playerId,
				newEmail: trimmedNewEmail,
			})

			// Update email in Firestore player document
			logger.info('Updating email in Firestore player document', {
				playerId,
			})
			const playerRef = firestore.collection(Collections.PLAYERS).doc(playerId)

			// Verify player document exists
			const playerDoc = await playerRef.get()
			if (!playerDoc.exists) {
				logger.warn(
					'Player document not found in Firestore, but Auth update succeeded',
					{
						playerId,
						newEmail: trimmedNewEmail,
					}
				)
				// Don't fail the function, just log the warning
				// The Auth update is more important
			} else {
				await playerRef.update({
					email: trimmedNewEmail,
				})
				logger.info('Email updated in Firestore player document', {
					playerId,
					newEmail: trimmedNewEmail,
				})
			}

			// Log successful operation for audit trail
			logger.info('Email update completed successfully', {
				playerId,
				oldEmail,
				newEmail: trimmedNewEmail,
				updatedBy: auth?.uid,
				timestamp: new Date().toISOString(),
			})

			return {
				success: true,
				playerId,
				newEmail: trimmedNewEmail,
				message: `Email successfully updated to ${trimmedNewEmail}`,
			}
		} catch (error) {
			logger.error('Error updating player email', {
				playerId,
				newEmail: trimmedNewEmail,
				adminUserId: auth?.uid,
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			})

			// Re-throw HttpsError as-is
			if (error instanceof HttpsError) {
				throw error
			}

			// Handle specific Firebase Auth errors
			if (error && typeof error === 'object' && 'code' in error) {
				const firebaseError = error as { code: string; message: string }
				switch (firebaseError.code) {
					case 'auth/invalid-email':
						throw new HttpsError(
							'invalid-argument',
							'Invalid email format provided.'
						)
					case 'auth/email-already-exists':
						throw new HttpsError(
							'already-exists',
							'Email address is already in use by another account.'
						)
					case 'auth/user-not-found':
						throw new HttpsError(
							'not-found',
							'User not found. Please verify the Player ID is correct.'
						)
					default:
						logger.error('Unhandled Firebase Auth error', {
							code: firebaseError.code,
							message: firebaseError.message,
						})
				}
			}

			// Wrap other errors
			throw new HttpsError(
				'internal',
				error instanceof Error
					? error.message
					: 'Failed to update player email. Please try again.'
			)
		}
	}
)
