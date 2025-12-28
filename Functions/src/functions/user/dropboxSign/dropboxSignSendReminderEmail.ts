/**
 * Send Dropbox Sign reminder email callable function
 *
 * Sends a reminder email for an existing signature request using the Dropbox Sign API.
 * This is the correct and performant way to remind users about pending signatures,
 * as opposed to creating a new signature request.
 *
 * Security validations performed:
 * - User must be authenticated and email verified
 * - User must not be banned for the current season
 * - User can only send reminders for their own signature requests
 * - Signature request ID must exist in the waivers collection
 * - Waiver must belong to the authenticated user
 *
 * @see https://developers.hellosign.com/api/reference/operation/signatureRequestRemind/
 */

import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	WaiverDocument,
	PlayerDocument,
	PlayerSeason,
} from '../../../types.js'
import {
	FIREBASE_CONFIG,
	getDropboxSignConfig,
} from '../../../config/constants.js'
import { validateAuthentication } from '../../../shared/auth.js'
import { getCurrentSeason } from '../../../shared/database.js'
import {
	SignatureRequestApi,
	SignatureRequestRemindRequest,
} from '@dropbox/sign'

/**
 * Sends a reminder email for an existing Dropbox Sign signature request
 */
export const dropboxSignSendReminderEmail = onCall(
	{
		region: FIREBASE_CONFIG.REGION,
		secrets: ['DROPBOX_SIGN_API_KEY'],
	},
	async (request) => {
		const { auth } = request
		const userId = auth?.uid ?? ''

		try {
			// Validate authentication
			validateAuthentication(auth)

			const firestore = getFirestore()

			// Get the current season
			const currentSeason = await getCurrentSeason()
			if (!currentSeason) {
				throw new HttpsError('failed-precondition', 'No current season found')
			}
			const seasonId = (currentSeason as unknown as { id: string }).id

			// Get player document and waiver in parallel
			const playerRef = firestore.collection(Collections.PLAYERS).doc(userId)
			const [playerDoc, waiverQuery] = await Promise.all([
				playerRef.get(),
				firestore
					.collection(Collections.DROPBOX)
					.doc(userId)
					.collection('waivers')
					.where('seasonId', '==', seasonId)
					.limit(1)
					.get(),
			])

			// Validate player exists
			if (!playerDoc.exists) {
				throw new HttpsError('not-found', 'Player not found')
			}

			const playerData = playerDoc.data() as PlayerDocument | undefined
			if (!playerData || !playerData.email) {
				throw new HttpsError('internal', 'Invalid player data')
			}

			// Check if player is banned for current season
			const currentSeasonData = playerData.seasons?.find(
				(s: PlayerSeason) => s.season.id === seasonId
			)
			if (currentSeasonData?.banned) {
				throw new HttpsError(
					'permission-denied',
					'Account is banned from this season'
				)
			}

			// Validate waiver exists
			if (waiverQuery.empty) {
				throw new HttpsError(
					'not-found',
					'No waiver found for this season. Please complete payment first.'
				)
			}

			const waiverData = waiverQuery.docs[0].data() as
				| WaiverDocument
				| undefined
			if (!waiverData) {
				throw new HttpsError('internal', 'Invalid waiver data')
			}

			// Check if waiver is already signed
			if (waiverData.status === 'signed') {
				throw new HttpsError(
					'failed-precondition',
					'Waiver has already been signed'
				)
			}

			const signatureRequestId = waiverData.signatureRequestId
			if (!signatureRequestId) {
				throw new HttpsError(
					'not-found',
					'No signature request found for your waiver'
				)
			}

			// Send reminder via Dropbox Sign API
			const dropboxConfig = getDropboxSignConfig()
			const dropbox = new SignatureRequestApi()
			dropbox.username = dropboxConfig.API_KEY

			const reminderRequest: SignatureRequestRemindRequest = {
				emailAddress: playerData.email,
			}

			try {
				await dropbox.signatureRequestRemind(
					signatureRequestId,
					reminderRequest
				)
			} catch (dropboxError) {
				logger.error('Dropbox Sign API error', {
					userId,
					signatureRequestId,
					error:
						dropboxError instanceof Error
							? dropboxError.message
							: 'Unknown error',
				})
				throw dropboxError
			}

			logger.info('Waiver reminder email sent', {
				userId,
				signatureRequestId,
				email: playerData.email,
			})

			return {
				success: true,
				message: 'Reminder email sent successfully',
				signatureRequestId,
			}
		} catch (error) {
			// Only log if not already an HttpsError (those are expected user errors)
			if (!(error instanceof HttpsError)) {
				logger.error('Unexpected error sending reminder email', {
					userId,
					error: error instanceof Error ? error.message : 'Unknown error',
				})
			}

			// Re-throw HttpsErrors directly
			if (error instanceof HttpsError) {
				throw error
			}

			// Wrap other errors
			throw new HttpsError(
				'internal',
				error instanceof Error ? error.message : 'Failed to send reminder email'
			)
		}
	}
)
