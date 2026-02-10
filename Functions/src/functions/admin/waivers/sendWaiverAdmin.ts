/**
 * Send waiver (admin) callable function
 *
 * Allows admins to manually send a waiver signature request to a player.
 * This is useful when a player pays with cash and needs to receive
 * a waiver without going through the Stripe payment flow.
 *
 * Security validations:
 * - User must be authenticated with verified email
 * - User must have admin privileges
 * - Target player must exist
 * - Player must be marked as paid for the specified season
 * - A waiver must not already exist for this player/season
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	PlayerDocument,
	SeasonDocument,
	WaiverDocument,
} from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import {
	FIREBASE_CONFIG,
	getDropboxSignConfig,
	EMAIL_CONFIG,
} from '../../../config/constants.js'
import { SignatureRequestApi, SubSigningOptions } from '@dropbox/sign'

interface SendWaiverAdminRequest {
	/** Player's Firebase Auth UID */
	playerId: string
	/** Season document ID (optional - defaults to current season) */
	seasonId?: string
}

interface SendWaiverAdminResponse {
	success: true
	playerId: string
	seasonId: string
	signatureRequestId: string
	message: string
}

/**
 * Sends a waiver signature request to a player
 *
 * This function replicates the waiver creation logic from onPaymentCreated
 * but allows admins to trigger it manually for cash payments.
 */
export const sendWaiverAdmin = onCall<SendWaiverAdminRequest>(
	{
		cors: [...FIREBASE_CONFIG.CORS_ORIGINS],
		region: FIREBASE_CONFIG.REGION,
		secrets: ['DROPBOX_SIGN_API_KEY'],
	},
	async (request): Promise<SendWaiverAdminResponse> => {
		const { data, auth } = request
		const { playerId, seasonId: requestedSeasonId } = data

		// Validate required fields
		if (!playerId) {
			throw new HttpsError('invalid-argument', 'Player ID is required')
		}

		try {
			const firestore = getFirestore()

			// Validate admin authentication
			await validateAdminUser(auth, firestore)

			// Get player document
			const playerRef = firestore.collection(Collections.PLAYERS).doc(playerId)
			const playerDoc = await playerRef.get()

			if (!playerDoc.exists) {
				throw new HttpsError('not-found', 'Player not found')
			}

			const playerDocument = playerDoc.data() as PlayerDocument | undefined
			if (!playerDocument) {
				throw new HttpsError('internal', 'Unable to retrieve player data')
			}

			// Determine which season to use
			let seasonId = requestedSeasonId
			let seasonDocument: SeasonDocument | undefined

			if (seasonId) {
				// Use the specified season
				const seasonRef = firestore
					.collection(Collections.SEASONS)
					.doc(seasonId)
				const seasonDoc = await seasonRef.get()

				if (!seasonDoc.exists) {
					throw new HttpsError('not-found', `Season not found: ${seasonId}`)
				}

				seasonDocument = seasonDoc.data() as SeasonDocument
			} else {
				// Find the current season
				const now = new Date()
				const seasonsSnapshot = await firestore
					.collection(Collections.SEASONS)
					.where('registrationStart', '<=', now)
					.orderBy('registrationStart', 'desc')
					.limit(1)
					.get()

				if (seasonsSnapshot.empty) {
					throw new HttpsError('not-found', 'No current season found')
				}

				seasonId = seasonsSnapshot.docs[0].id
				seasonDocument = seasonsSnapshot.docs[0].data() as SeasonDocument
			}

			// Check if player is paid for this season
			const playerSeasonData = playerDocument.seasons?.find(
				(s) => s.season.id === seasonId
			)

			if (!playerSeasonData?.paid) {
				throw new HttpsError(
					'failed-precondition',
					`Player is not marked as paid for season "${seasonDocument?.name || seasonId}". ` +
						'Please mark the player as paid before sending a waiver.'
				)
			}

			// Check if waiver already exists for this player/season
			const existingWaiver = await firestore
				.collection(Collections.DROPBOX)
				.doc(playerId)
				.collection('waivers')
				.where('seasonId', '==', seasonId)
				.limit(1)
				.get()

			if (!existingWaiver.empty) {
				const existingWaiverData =
					existingWaiver.docs[0].data() as WaiverDocument
				throw new HttpsError(
					'already-exists',
					`A waiver already exists for this player/season (status: ${existingWaiverData.status}). ` +
						'Use the "Send Reminder" function if you need to resend the waiver email.'
				)
			}

			// Initialize Dropbox Sign API
			const dropboxConfig = getDropboxSignConfig()
			const dropbox = new SignatureRequestApi()
			dropbox.username = dropboxConfig.API_KEY

			// Send Dropbox signature request
			const signatureResponse = await dropbox.signatureRequestSendWithTemplate({
				templateIds: [dropboxConfig.TEMPLATE_ID],
				subject: EMAIL_CONFIG.WAIVER_SUBJECT,
				message: EMAIL_CONFIG.WAIVER_MESSAGE,
				signers: [
					{
						role: 'Participant',
						name: `${playerDocument.firstname} ${playerDocument.lastname}`,
						emailAddress: playerDocument.email,
					},
				],
				signingOptions: {
					draw: true,
					type: true,
					upload: true,
					phone: false,
					defaultType: SubSigningOptions.DefaultTypeEnum.Type,
				},
				metadata: {
					firebaseUID: playerId,
					seasonId: seasonId,
				},
				testMode: dropboxConfig.TEST_MODE,
			})

			const signatureRequestId =
				signatureResponse.body.signatureRequest?.signatureRequestId

			if (!signatureRequestId) {
				throw new HttpsError(
					'internal',
					'Failed to create signature request - no ID returned from Dropbox Sign'
				)
			}

			// Create waiver document in dropbox/{uid}/waivers subcollection
			await firestore
				.collection(Collections.DROPBOX)
				.doc(playerId)
				.collection('waivers')
				.add({
					seasonId: seasonId,
					signatureRequestId: signatureRequestId,
					status: 'pending',
					createdAt: new Date(),
				})

			logger.info('Admin sent waiver to player', {
				adminId: auth?.uid,
				playerId,
				seasonId,
				signatureRequestId,
				playerEmail: playerDocument.email,
			})

			return {
				success: true,
				playerId,
				seasonId,
				signatureRequestId,
				message: `Waiver sent successfully to ${playerDocument.email}`,
			}
		} catch (error) {
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error sending waiver:', {
				adminId: auth?.uid,
				playerId: data.playerId,
				seasonId: data.seasonId,
				error: errorMessage,
			})

			throw new HttpsError('internal', `Failed to send waiver: ${errorMessage}`)
		}
	}
)
