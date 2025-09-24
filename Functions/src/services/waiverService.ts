/**
 * Waiver management service
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerSeason, PlayerDocument } from '../types.js'
import {
	FIREBASE_CONFIG,
	getDropboxSignConfig,
	EMAIL_CONFIG,
} from '../config/constants.js'
import { validateAuthentication } from '../shared/auth.js'
import { SignatureRequestApi, SubSigningOptions } from '@dropbox/sign'

/**
 * Re-send waiver email reminder to a player
 *
 * @see https://firebase.google.com/docs/functions/callable#write_and_deploy_the_callable_function
 */
export const resendWaiverEmail = onCall(
	{
		region: FIREBASE_CONFIG.REGION,
		cors: [...FIREBASE_CONFIG.CORS_ORIGINS],
		secrets: ['DROPBOX_SIGN_API_KEY'],
	},
	async (request) => {
		try {
			validateAuthentication(request.auth)

			const firestore = getFirestore()
			const playerId = request.auth!.uid

			// Get player data
			const playerDoc = await firestore
				.collection(Collections.PLAYERS)
				.doc(playerId)
				.get()

			if (!playerDoc.exists) {
				throw new Error('Player not found')
			}

			const playerDocument = playerDoc.data() as PlayerDocument | undefined
			if (!playerDocument) {
				throw new Error('Invalid player data')
			}

			// Check if player has already paid
			const currentSeason = playerDocument.seasons?.find(
				(season: PlayerSeason) => season.paid && !season.signed
			)

			if (!currentSeason) {
				throw new Error('No pending waiver found for player')
			}

			// Send Dropbox signature request
			const dropboxConfig = getDropboxSignConfig()
			const dropbox = new SignatureRequestApi()
			dropbox.username = dropboxConfig.API_KEY

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
				testMode: dropboxConfig.TEST_MODE,
			})

			logger.info(`Resent waiver email to player: ${playerId}`)

			return {
				success: true,
				signatureRequestId:
					signatureResponse.body.signatureRequest?.signatureRequestId,
				message: 'Waiver email sent successfully',
			}
		} catch (error) {
			logger.error('Error resending waiver email:', {
				playerId: request.auth?.uid,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new Error(
				error instanceof Error ? error.message : 'Failed to resend waiver email'
			)
		}
	}
)
