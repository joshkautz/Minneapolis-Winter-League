/**
 * Dropbox Sign webhook handler
 */

import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, WaiverDocument, PlayerDocument } from '../../types.js'
import { FIREBASE_CONFIG, DROPBOX_SIGN_CONFIG } from '../../config/constants.js'
import { handleFunctionError } from '../../shared/errors.js'
import {
	EventCallbackRequest,
	EventCallbackRequestEvent,
	EventCallbackHelper,
} from '@dropbox/sign'

/**
 * Webhook handler for Dropbox Sign events
 * Updates player's signed status when waiver is signed
 *
 * @see https://firebase.google.com/docs/functions/http-events#trigger_a_function_with_an_http_request
 */
export const dropboxSignWebhook = onRequest(
	{
		region: FIREBASE_CONFIG.REGION,
		secrets: ['DROPBOX_SIGN_API_KEY'],
	},
	async (req, resp) => {
		try {
			logger.info('Received Dropbox Sign webhook')

			const data = req.body.toString().match(/\{.*\}/s)?.[0]
			if (!data) {
				logger.error('Invalid webhook data received')
				resp.status(400).send('Invalid data')
				return
			}

			const callbackData = JSON.parse(data)
			const callbackEvent = EventCallbackRequest.init(callbackData)

			// Verify that the callback came from Dropbox Sign
			if (
				!EventCallbackHelper.isValid(DROPBOX_SIGN_CONFIG.API_KEY, callbackEvent)
			) {
				logger.error('Invalid webhook signature')
				resp.status(401).send('Unauthorized')
				return
			}

			// Handle signature request signed event
			if (
				callbackEvent.event.eventType ===
				EventCallbackRequestEvent.EventTypeEnum.SignatureRequestSigned
			) {
				const signatureRequestId =
					callbackEvent.signatureRequest?.signatureRequestId

				if (signatureRequestId) {
					await handleWaiverSigned(signatureRequestId)
				}
			}

			resp.status(200).send('OK')
		} catch (error) {
			logger.error('Error processing Dropbox Sign webhook:', error)
			resp.status(500).send('Internal server error')
		}
	}
)

/**
 * Handles the waiver signed event
 */
async function handleWaiverSigned(signatureRequestId: string): Promise<void> {
	const firestore = getFirestore()

	try {
		// Find the waiver document
		const waiverQuery = await firestore
			.collection(Collections.WAIVERS)
			.where('signatureRequestId', '==', signatureRequestId)
			.limit(1)
			.get()

		if (waiverQuery.empty) {
			logger.warn(
				`No waiver found for signature request: ${signatureRequestId}`
			)
			return
		}

		const waiverDoc = waiverQuery.docs[0]
		const waiverData = waiverDoc.data() as WaiverDocument | undefined

		if (!waiverData) {
			logger.error('Invalid waiver data')
			return
		}

		// Update waiver status
		await waiverDoc.ref.update({
			status: 'signed',
			signedAt: new Date(),
		})

		// Update player's signed status
		const playerDoc = await waiverData.player.get()
		if (playerDoc.exists) {
			const playerDocument = playerDoc.data() as PlayerDocument | undefined
			if (playerDocument) {
				const updatedSeasons =
					playerDocument.seasons?.map((season) =>
						season.season.id === waiverData.season
							? { ...season, signed: true }
							: season
					) || []

				await playerDoc.ref.update({ seasons: updatedSeasons })
			}
		}

		logger.info(
			`Successfully processed waiver signing for: ${signatureRequestId}`
		)
	} catch (error) {
		throw handleFunctionError(error, 'handleWaiverSigned', {
			signatureRequestId,
		})
	}
}
