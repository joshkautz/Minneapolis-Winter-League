/**
 * Send Dropbox Sign reminder email callable function
 *
 * Sends a reminder email for an existing signature request using the Dropbox Sign API.
 * This is the correct and performant way to remind users about pending signatures,
 * as opposed to creating a new signature request.
 *
 * Security validations performed:
 * - User must be authenticated and email verified
 * - User can only send reminders for their own signature requests
 * - Signature request ID must exist in the waivers collection
 * - Waiver must belong to the authenticated user
 *
 * Performance considerations:
 * - Uses the signatureRequestRemind API (not signatureRequestSend)
 * - Does not create duplicate signature requests
 * - Minimal database reads (single waiver document lookup)
 */

import { getFirestore } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions/v1'
import { logger } from 'firebase-functions/v2'
import { Collections, WaiverDocument } from '../../types.js'
import {
	FIREBASE_CONFIG,
	getDropboxSignConfig,
} from '../../config/constants.js'
import { validateAuthentication } from '../../shared/auth.js'
import {
	SignatureRequestApi,
	SignatureRequestRemindRequest,
} from '@dropbox/sign'

/**
 * Request interface for sending a reminder email
 */
interface SendReminderEmailRequest {
	signatureRequestId: string
}

/**
 * Sends a reminder email for an existing Dropbox Sign signature request
 *
 * Note: This uses the signatureRequestRemind API endpoint, which is designed
 * for sending reminders about existing signature requests. This is more efficient
 * and correct than creating a new signature request.
 *
 * @see https://developers.hellosign.com/api/reference/operation/signatureRequestRemind/
 */
export const dropboxSignSendReminderEmail = functions
	.region(FIREBASE_CONFIG.REGION)
	.https.onCall(
		async (
			data: SendReminderEmailRequest,
			context: functions.https.CallableContext
		) => {
			try {
				// Validate authentication
				validateAuthentication(context.auth)

				const { signatureRequestId } = data
				const userId = context.auth!.uid

				if (!signatureRequestId) {
					throw new functions.https.HttpsError(
						'invalid-argument',
						'Signature request ID is required'
					)
				}

				const firestore = getFirestore()

				// Find the waiver document by signature request ID
				const waiverQuery = await firestore
					.collection(Collections.WAIVERS)
					.where('signatureRequestId', '==', signatureRequestId)
					.limit(1)
					.get()

				if (waiverQuery.empty) {
					throw new functions.https.HttpsError(
						'not-found',
						'Waiver not found for this signature request'
					)
				}

				const waiverDoc = waiverQuery.docs[0]
				const waiverData = waiverDoc.data() as WaiverDocument | undefined

				if (!waiverData) {
					throw new functions.https.HttpsError(
						'internal',
						'Invalid waiver data'
					)
				}

				// Verify that the waiver belongs to this user
				const playerRef = waiverData.player
				if (playerRef.id !== userId) {
					throw new functions.https.HttpsError(
						'permission-denied',
						'You do not have permission to send a reminder for this signature request'
					)
				}

				// Get the player's email for the reminder
				const playerDoc = await playerRef.get()
				if (!playerDoc.exists) {
					throw new functions.https.HttpsError('not-found', 'Player not found')
				}

				const playerData = playerDoc.data()
				if (!playerData || !playerData.email) {
					throw new functions.https.HttpsError(
						'internal',
						'Invalid player data'
					)
				}

				// Send reminder using Dropbox Sign API
				const dropboxConfig = getDropboxSignConfig()
				const dropbox = new SignatureRequestApi()
				dropbox.username = dropboxConfig.API_KEY

				// Create the reminder request
				const reminderRequest = SignatureRequestRemindRequest.init({
					emailAddress: playerData.email,
				})

				await dropbox.signatureRequestRemind(
					signatureRequestId,
					reminderRequest
				)

				logger.info('Sent reminder email for signature request', {
					playerId: userId,
					signatureRequestId,
					emailAddress: playerData.email,
				})

				return {
					success: true,
					message: 'Reminder email sent successfully',
					signatureRequestId,
				}
			} catch (error) {
				// Log the error with context
				logger.error('Error sending reminder email:', {
					playerId: context.auth?.uid,
					signatureRequestId: data?.signatureRequestId,
					error: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
				})

				// If it's already an HttpsError, re-throw it
				if (error instanceof functions.https.HttpsError) {
					throw error
				}

				// Otherwise, wrap it in a generic error
				throw new functions.https.HttpsError(
					'internal',
					error instanceof Error
						? error.message
						: 'Failed to send reminder email'
				)
			}
		}
	)
