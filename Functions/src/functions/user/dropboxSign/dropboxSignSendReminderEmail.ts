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
import { Collections, WaiverDocument } from '../../../types.js'
import {
	FIREBASE_CONFIG,
	getDropboxSignConfig,
} from '../../../config/constants.js'
import { validateAuthentication } from '../../../shared/auth.js'
import {
	SignatureRequestApi,
	SignatureRequestRemindRequest,
} from '@dropbox/sign'

/**
 * Sends a reminder email for an existing Dropbox Sign signature request
 *
 * Note: This uses the signatureRequestRemind API endpoint, which is designed
 * for sending reminders about existing signature requests. This is more efficient
 * and correct than creating a new signature request.
 *
 * The function automatically looks up the authenticated user's waiver and sends
 * a reminder for their signature request.
 *
 * @see https://developers.hellosign.com/api/reference/operation/signatureRequestRemind/
 */
export const dropboxSignSendReminderEmail = functions
	.region(FIREBASE_CONFIG.REGION)
	.runWith({
		secrets: ['DROPBOX_SIGN_API_KEY'],
	})
	.https.onCall(
		async (data: unknown, context: functions.https.CallableContext) => {
			try {
				// Validate authentication
				validateAuthentication(context.auth)

				const userId = context.auth?.uid ?? ''
				logger.info('Starting reminder email process', {
					userId,
					timestamp: new Date().toISOString(),
				})

				const firestore = getFirestore()

				// Get the player document reference
				const playerRef = firestore.collection(Collections.PLAYERS).doc(userId)
				logger.info('Player reference created', { userId })

				// Find the waiver document for this user
				logger.info('Querying for waiver document', { userId })
				const waiverQuery = await firestore
					.collection(Collections.WAIVERS)
					.where('player', '==', playerRef)
					.limit(1)
					.get()

				logger.info('Waiver query completed', {
					isEmpty: waiverQuery.empty,
					resultCount: waiverQuery.size,
				})

				if (waiverQuery.empty) {
					throw new functions.https.HttpsError(
						'not-found',
						'No waiver found for this user. Please complete payment first.'
					)
				}

				const waiverDoc = waiverQuery.docs[0]
				const waiverData = waiverDoc.data() as WaiverDocument | undefined

				logger.info('Waiver document retrieved', {
					hasData: !!waiverData,
					waiverDocId: waiverDoc.id,
					waiverFields: waiverData ? Object.keys(waiverData) : [],
					signatureRequestId: waiverData?.signatureRequestId,
					playerId: waiverData?.player.id,
				})

				if (!waiverData) {
					throw new functions.https.HttpsError(
						'internal',
						'Invalid waiver data'
					)
				}

				const signatureRequestId = waiverData.signatureRequestId

				logger.info('Signature request ID extracted', {
					hasSignatureRequestId: !!signatureRequestId,
					signatureRequestIdLength: signatureRequestId?.length,
				})

				if (!signatureRequestId) {
					throw new functions.https.HttpsError(
						'not-found',
						'No signature request found for your waiver'
					)
				}

				// Get the player's email for the reminder
				logger.info('Fetching player document', { userId })
				const playerDoc = await playerRef.get()

				logger.info('Player document retrieved', {
					exists: playerDoc.exists,
					hasData: !!playerDoc.data(),
				})

				if (!playerDoc.exists) {
					throw new functions.https.HttpsError('not-found', 'Player not found')
				}

				const playerData = playerDoc.data()

				logger.info('Player data parsed', {
					hasPlayerData: !!playerData,
					hasEmail: !!(playerData && playerData.email),
					emailDomain: playerData?.email?.split('@')[1],
				})

				if (!playerData || !playerData.email) {
					throw new functions.https.HttpsError(
						'internal',
						'Invalid player data'
					)
				}

				// Send reminder using Dropbox Sign API
				logger.info('Initializing Dropbox Sign API')
				const dropboxConfig = getDropboxSignConfig()

				logger.info('Dropbox configuration loaded', {
					hasApiKey: !!dropboxConfig.API_KEY,
					apiKeyLength: dropboxConfig.API_KEY?.length,
					apiKeyPrefix: dropboxConfig.API_KEY?.substring(0, 15) + '...',
					hasTemplateId: !!dropboxConfig.TEMPLATE_ID,
					testMode: dropboxConfig.TEST_MODE,
				})

				const dropbox = new SignatureRequestApi()
				dropbox.username = dropboxConfig.API_KEY

				logger.info('Dropbox Sign API configuration', {
					hasApiKey: !!dropboxConfig.API_KEY,
					apiKeyPrefix: dropboxConfig.API_KEY?.substring(0, 10),
					signatureRequestId,
					emailAddress: playerData.email,
				})

				// Create the reminder request
				const reminderRequest: SignatureRequestRemindRequest = {
					emailAddress: playerData.email,
				}

				logger.info('Sending reminder request to Dropbox Sign API', {
					signatureRequestId,
					reminderRequest,
					requestType: 'signatureRequestRemind',
				})

				let response
				try {
					response = await dropbox.signatureRequestRemind(
						signatureRequestId,
						reminderRequest
					)
					logger.info('Dropbox Sign API call successful')
				} catch (dropboxError) {
					logger.error('Dropbox Sign API call failed', {
						error:
							dropboxError instanceof Error ? dropboxError.message : 'Unknown',
						errorName:
							dropboxError instanceof Error ? dropboxError.name : undefined,
						errorStack:
							dropboxError instanceof Error ? dropboxError.stack : undefined,
						fullError: JSON.stringify(dropboxError, null, 2),
					})
					throw dropboxError
				}

				logger.info('Dropbox Sign API response received', {
					hasResponse: !!response,
					responseType: typeof response,
					responseKeys: response ? Object.keys(response) : [],
				})

				logger.info('Sent reminder email for signature request', {
					playerId: userId,
					signatureRequestId,
					emailAddress: playerData.email,
				})

				logger.info('Reminder email process completed successfully', {
					userId,
					signatureRequestId,
					timestamp: new Date().toISOString(),
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
					error: error instanceof Error ? error.message : 'Unknown error',
					errorType:
						error instanceof Error ? error.constructor.name : typeof error,
					stack: error instanceof Error ? error.stack : undefined,
					fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
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
