/**
 * Verify user email callable function
 *
 * This function allows admins to mark a user's email address as verified in Firebase Authentication.
 * The admin can provide either the user's email address or their UID.
 */

import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions/v1'
import { validateAdminUser } from '../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'

/**
 * Request interface for verifying a user's email
 */
interface VerifyUserEmailRequest {
	/** User's email address OR Firebase Auth UID (one is required) */
	email?: string
	uid?: string
}

/**
 * Response interface for successful email verification
 */
interface VerifyUserEmailResponse {
	success: true
	userId: string
	email: string
	message: string
}

/**
 * Marks a user's email address as verified in Firebase Authentication
 *
 * Security validations:
 * - User must be authenticated with verified email
 * - User must have admin privileges (admin: true in player document)
 * - Target user must exist
 * - Either email or uid must be provided
 *
 * After successful update:
 * - Email is marked as verified in Firebase Authentication
 * - Operation is logged for audit purposes
 */
export const verifyUserEmail = functions
	.region(FIREBASE_CONFIG.REGION)
	.https.onCall(
		async (
			data: VerifyUserEmailRequest,
			context: functions.https.CallableContext
		): Promise<VerifyUserEmailResponse> => {
			const { auth } = context

			functions.logger.info('verifyUserEmail called', {
				adminUserId: auth?.uid,
				providedEmail: data.email,
				providedUid: data.uid,
			})

			// Validate admin authentication
			const firestore = getFirestore()
			await validateAdminUser(auth, firestore)

			const { email, uid } = data

			// Validate that at least one identifier is provided
			if (!email && !uid) {
				functions.logger.warn('No identifier provided')
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Either email address or user ID must be provided'
				)
			}

			// Validate email format if provided
			if (email) {
				const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
				if (!emailRegex.test(email.trim())) {
					functions.logger.warn('Invalid email format provided', { email })
					throw new functions.https.HttpsError(
						'invalid-argument',
						'Invalid email format. Please provide a valid email address.'
					)
				}
			}

			// Validate uid format if provided
			if (uid && typeof uid !== 'string') {
				functions.logger.warn('Invalid uid provided', { uid })
				throw new functions.https.HttpsError(
					'invalid-argument',
					'User ID must be a valid string'
				)
			}

			try {
				const auth = getAuth()

				// Fetch user by email or uid
				functions.logger.info('Fetching user from Authentication', {
					email,
					uid,
				})

				let userRecord
				try {
					if (uid) {
						userRecord = await auth.getUser(uid.trim())
					} else if (email) {
						userRecord = await auth.getUserByEmail(email.trim().toLowerCase())
					}
				} catch (error) {
					functions.logger.error('User not found in Authentication', {
						email,
						uid,
						error: error instanceof Error ? error.message : 'Unknown error',
					})
					throw new functions.https.HttpsError(
						'not-found',
						'User not found. Please verify the email or User ID is correct.'
					)
				}

				// Check if email is already verified
				if (userRecord!.emailVerified) {
					functions.logger.info('Email already verified', {
						userId: userRecord!.uid,
						email: userRecord!.email,
					})
					return {
						success: true,
						userId: userRecord!.uid,
						email: userRecord!.email || '',
						message: `Email ${userRecord!.email} is already verified`,
					}
				}

				// Mark email as verified
				functions.logger.info('Marking email as verified', {
					userId: userRecord!.uid,
					email: userRecord!.email,
				})

				await auth.updateUser(userRecord!.uid, {
					emailVerified: true,
				})

				functions.logger.info('Email successfully marked as verified', {
					userId: userRecord!.uid,
					email: userRecord!.email,
				})

				// Log successful operation for audit trail
				functions.logger.info('Email verification completed successfully', {
					userId: userRecord!.uid,
					email: userRecord!.email,
					verifiedBy: context.auth!.uid,
					timestamp: new Date().toISOString(),
				})

				return {
					success: true,
					userId: userRecord!.uid,
					email: userRecord!.email || '',
					message: `Email ${userRecord!.email} has been successfully marked as verified`,
				}
			} catch (error) {
				functions.logger.error('Error verifying user email', {
					email,
					uid,
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
						case 'auth/user-not-found':
							throw new functions.https.HttpsError(
								'not-found',
								'User not found. Please verify the email or User ID is correct.'
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
						: 'Failed to verify user email. Please try again.'
				)
			}
		}
	)
