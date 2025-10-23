/**
 * Update player email callable function
 *
 * This function allows admins to change a user's email address in Firebase Authentication.
 * The new email is automatically marked as verified.
 */

import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions/v1'
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
export const updatePlayerEmail = functions
	.region(FIREBASE_CONFIG.REGION)
	.https.onCall(
		async (
			data: UpdatePlayerEmailRequest,
			context: functions.https.CallableContext
		): Promise<UpdatePlayerEmailResponse> => {
			const { auth } = context

			functions.logger.info('updatePlayerEmail called', {
				adminUserId: auth?.uid,
				targetPlayerId: data.playerId,
			})

			// Validate admin authentication
			const firestore = getFirestore()
			await validateAdminUser(auth, firestore)

			const { playerId, newEmail } = data

			// Validate required fields
			if (!playerId || typeof playerId !== 'string') {
				functions.logger.warn('Invalid playerId provided', { playerId })
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Player ID is required and must be a valid string'
				)
			}

			if (!newEmail || typeof newEmail !== 'string') {
				functions.logger.warn('Invalid newEmail provided', { newEmail })
				throw new functions.https.HttpsError(
					'invalid-argument',
					'New email address is required and must be a valid string'
				)
			}

			// Validate email format
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
			if (!emailRegex.test(newEmail.trim())) {
				functions.logger.warn('Invalid email format provided', {
					newEmail: newEmail.trim(),
				})
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Invalid email format. Please provide a valid email address.'
				)
			}

			const trimmedNewEmail = newEmail.trim().toLowerCase()

			try {
				const auth = getAuth()

				// Check if target user exists
				functions.logger.info('Fetching target user from Authentication', {
					playerId,
				})
				let userRecord
				try {
					userRecord = await auth.getUser(playerId)
				} catch (error) {
					functions.logger.error('Target user not found in Authentication', {
						playerId,
						error: error instanceof Error ? error.message : 'Unknown error',
					})
					throw new functions.https.HttpsError(
						'not-found',
						'User not found. Please verify the Player ID is correct.'
					)
				}

				const oldEmail = userRecord.email

				functions.logger.info('Current user email retrieved', {
					playerId,
					oldEmail,
				})

				// Check if new email is the same as current email
				if (oldEmail?.toLowerCase() === trimmedNewEmail) {
					functions.logger.warn('New email same as current email', {
						playerId,
						email: trimmedNewEmail,
					})
					throw new functions.https.HttpsError(
						'invalid-argument',
						`User already has email address: ${trimmedNewEmail}`
					)
				}

				// Check if new email is already in use by another user
				functions.logger.info('Checking if new email is already in use', {
					newEmail: trimmedNewEmail,
				})
				try {
					const existingUser = await auth.getUserByEmail(trimmedNewEmail)
					if (existingUser.uid !== playerId) {
						functions.logger.warn('Email already in use by another user', {
							newEmail: trimmedNewEmail,
							existingUserId: existingUser.uid,
							targetPlayerId: playerId,
						})
						throw new functions.https.HttpsError(
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
						functions.logger.info('New email is available', {
							newEmail: trimmedNewEmail,
						})
					} else {
						// Re-throw if it's our HttpsError from the duplicate check
						throw error
					}
				}

				// Update email in Firebase Authentication and mark as verified
				functions.logger.info('Updating email in Firebase Authentication', {
					playerId,
					oldEmail,
					newEmail: trimmedNewEmail,
				})
				await auth.updateUser(playerId, {
					email: trimmedNewEmail,
					emailVerified: true, // Mark email as verified
				})

				functions.logger.info(
					'Email successfully updated in Firebase Authentication',
					{
						playerId,
						newEmail: trimmedNewEmail,
					}
				)

				// Update email in Firestore player document
				functions.logger.info('Updating email in Firestore player document', {
					playerId,
				})
				const playerRef = firestore
					.collection(Collections.PLAYERS)
					.doc(playerId)

				// Verify player document exists
				const playerDoc = await playerRef.get()
				if (!playerDoc.exists) {
					functions.logger.warn(
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
					functions.logger.info('Email updated in Firestore player document', {
						playerId,
						newEmail: trimmedNewEmail,
					})
				}

				// Log successful operation for audit trail
				functions.logger.info('Email update completed successfully', {
					playerId,
					oldEmail,
					newEmail: trimmedNewEmail,
					updatedBy: context.auth!.uid,
					timestamp: new Date().toISOString(),
				})

				return {
					success: true,
					playerId,
					newEmail: trimmedNewEmail,
					message: `Email successfully updated to ${trimmedNewEmail}`,
				}
			} catch (error) {
				functions.logger.error('Error updating player email', {
					playerId,
					newEmail: trimmedNewEmail,
					adminUserId: context.auth!.uid,
					error: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
				})

				// Re-throw HttpsError as-is
				if (error instanceof functions.https.HttpsError) {
					throw error
				}

				// Handle specific Firebase Auth errors
				if (error && typeof error === 'object' && 'code' in error) {
					const firebaseError = error as { code: string; message: string }
					switch (firebaseError.code) {
						case 'auth/invalid-email':
							throw new functions.https.HttpsError(
								'invalid-argument',
								'Invalid email format provided.'
							)
						case 'auth/email-already-exists':
							throw new functions.https.HttpsError(
								'already-exists',
								'Email address is already in use by another account.'
							)
						case 'auth/user-not-found':
							throw new functions.https.HttpsError(
								'not-found',
								'User not found. Please verify the Player ID is correct.'
							)
						default:
							functions.logger.error('Unhandled Firebase Auth error', {
								code: firebaseError.code,
								message: firebaseError.message,
							})
					}
				}

				// Wrap other errors
				throw new functions.https.HttpsError(
					'internal',
					error instanceof Error
						? error.message
						: 'Failed to update player email. Please try again.'
				)
			}
		}
	)
