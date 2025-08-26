/**
 * Payment and waiver related Firebase Functions
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onCall, onRequest } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	SignatureRequestApi,
	SubSigningOptions,
	EventCallbackHelper,
	EventCallbackRequest,
	EventCallbackRequestEvent,
	HttpError,
} from '@dropbox/sign'
import { 
	Collections, 
	PlayerDocument, 
	WaiverDocument,
} from '@minneapolis-winter-league/shared'
import { 
	DROPBOX_SIGN_CONFIG, 
	FIREBASE_CONFIG, 
	EMAIL_CONFIG 
} from '../config/constants.js'
import { 
	getCurrentSeason, 
	handleFunctionError, 
	validateAuthentication 
} from '../utils/helpers.js'

/**
 * When a payment is created and succeeded, update the player's paid status
 * and send them a Dropbox signature request for the waiver
 * 
 * @see https://firebase.google.com/docs/functions/firestore-events#trigger_a_function_when_a_new_document_is_created
 */
export const onPaymentCreated = onDocumentCreated(
	{ 
		document: 'customers/{uid}/payments/{sid}', 
		region: FIREBASE_CONFIG.REGION 
	},
	async (event) => {
		const { uid, sid } = event.params
		
		try {
			logger.info(`Processing payment creation for user: ${uid}, payment: ${sid}`)
			
			const firestore = getFirestore()
			const dropbox = new SignatureRequestApi()
			dropbox.username = DROPBOX_SIGN_CONFIG.API_KEY

			// Get payment document
			const paymentDoc = await firestore
				.collection('customers')
				.doc(uid)
				.collection('payments')
				.doc(sid)
				.get()

			const paymentData = paymentDoc.data()
			if (!paymentData || paymentData.status !== 'succeeded') {
				logger.info(`Payment not succeeded, skipping waiver creation for ${uid}`)
				return
			}

			// Get current season and player data
			const [currentSeason, playerDoc] = await Promise.all([
				getCurrentSeason(),
				firestore.collection(Collections.PLAYERS).doc(uid).get()
			])

			if (!currentSeason) {
				throw new Error('No current season found')
			}

			if (!playerDoc.exists) {
				throw new Error(`Player document not found for UID: ${uid}`)
			}

			const playerData = playerDoc.data() as PlayerDocument

			// Update player's paid status for current season
			const updatedSeasons = playerData.seasons?.map(season => 
				season.season.id === currentSeason.id
					? { ...season, paid: true }
					: season
			) || []

			await playerDoc.ref.update({ seasons: updatedSeasons })

			// Send Dropbox signature request
			const signatureResponse = await dropbox.signatureRequestSendWithTemplate({
				templateIds: [DROPBOX_SIGN_CONFIG.TEMPLATE_ID],
				subject: EMAIL_CONFIG.WAIVER_SUBJECT,
				message: EMAIL_CONFIG.WAIVER_MESSAGE,
				signers: [{
					role: 'Participant',
					name: `${playerData.firstname} ${playerData.lastname}`,
					emailAddress: playerData.email,
				}],
				signingOptions: {
					draw: true,
					type: true,
					upload: true,
					phone: false,
					defaultType: SubSigningOptions.DefaultTypeEnum.Type,
				},
				testMode: DROPBOX_SIGN_CONFIG.TEST_MODE,
			})

			// Create waiver document
			if (signatureResponse.body.signatureRequest?.signatureRequestId) {
				await firestore
					.collection(Collections.WAIVERS)
					.doc(signatureResponse.body.signatureRequest.signatureRequestId)
					.set({
						player: playerDoc.ref,
						createdAt: FieldValue.serverTimestamp(),
					})
			}

			logger.info(`Successfully processed payment and created waiver for user: ${uid}`)

		} catch (error) {
			throw handleFunctionError(error, 'onPaymentCreated', { uid, sid })
		}
	}
)

/**
 * Webhook handler for Dropbox Sign events
 * Updates player's signed status when waiver is signed
 * 
 * @see https://firebase.google.com/docs/functions/http-events#trigger_a_function_with_an_http_request
 */
export const dropboxSignWebhook = onRequest(
	{ region: FIREBASE_CONFIG.REGION },
	async (req, resp) => {
		try {
			logger.info('Received Dropbox Sign webhook')

			const data = req.body.toString().match(/\{.*\}/s)?.[0]
			if (!data) {
				logger.warn('No valid JSON data found in webhook body')
				resp.status(400).send('Invalid request body')
				return
			}

			const callbackData = JSON.parse(data)
			const callbackEvent = EventCallbackRequest.init(callbackData)

			// Verify that the callback came from Dropbox Sign
			if (!EventCallbackHelper.isValid(DROPBOX_SIGN_CONFIG.API_KEY, callbackEvent)) {
				logger.warn('Invalid Dropbox Sign webhook signature')
				resp.status(401).send('Invalid signature')
				return
			}

			// Handle signature request signed event
			if (callbackEvent.event.eventType === EventCallbackRequestEvent.EventTypeEnum.SignatureRequestSigned) {
				const signatureRequestId = callbackEvent.signatureRequest?.signatureRequestId

				if (signatureRequestId) {
					await handleWaiverSigned(signatureRequestId)
				}
			}

			resp.status(200).send('Webhook processed successfully')

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
		// Get waiver document
		const waiverDoc = await firestore
			.collection(Collections.WAIVERS)
			.doc(signatureRequestId)
			.get()

		if (!waiverDoc.exists) {
			logger.warn(`Waiver document not found for signature request: ${signatureRequestId}`)
			return
		}

		const waiverData = waiverDoc.data() as WaiverDocument
		const playerRef = waiverData.player

		// Get current season and player data
		const [currentSeason, playerDoc] = await Promise.all([
			getCurrentSeason(),
			playerRef.get()
		])

		if (!currentSeason || !playerDoc.exists) {
			throw new Error('Missing current season or player data')
		}

		const playerData = playerDoc.data() as PlayerDocument

		// Update player's signed status for current season
		const updatedSeasons = playerData.seasons?.map(season => 
			season.season.id === currentSeason.id
				? { ...season, signed: true }
				: season
		) || []

		await playerRef.update({ seasons: updatedSeasons })

		logger.info(`Updated signed status for player after waiver signing`, {
			playerId: playerRef.id,
			signatureRequestId,
		})

	} catch (error) {
		throw handleFunctionError(error, 'handleWaiverSigned', { signatureRequestId })
	}
}

/**
 * Re-send waiver email reminder to a player
 * 
 * @see https://firebase.google.com/docs/functions/callable#write_and_deploy_the_callable_function
 */
export const resendWaiverEmail = onCall(
	{
		region: FIREBASE_CONFIG.REGION,
		cors: ['https://mplswinterleague.com'],
	},
	async (request) => {
		try {
			validateAuthentication(request.auth)

			const firestore = getFirestore()
			const dropbox = new SignatureRequestApi()
			dropbox.username = DROPBOX_SIGN_CONFIG.API_KEY

			const uid = request.auth!.uid

			// Get player document
			const playerDoc = await firestore
				.collection(Collections.PLAYERS)
				.doc(uid)
				.get()

			if (!playerDoc.exists) {
				throw new Error('Player not found')
			}

			const playerData = playerDoc.data() as PlayerDocument

			// Find waiver for this player
			const waiverQuery = await firestore
				.collection(Collections.WAIVERS)
				.where('player', '==', playerDoc.ref)
				.limit(1)
				.get()

			if (waiverQuery.empty) {
				throw new Error('No waiver found for this player')
			}

			const signatureRequestId = waiverQuery.docs[0].id

			// Send reminder email
			await dropbox.signatureRequestRemind(signatureRequestId, {
				emailAddress: playerData.email,
				name: `${playerData.firstname} ${playerData.lastname}`,
			})

			logger.info(`Sent waiver reminder email`, {
				playerId: uid,
				signatureRequestId,
			})

			return {
				success: true,
				message: 'Reminder email sent successfully'
			}

		} catch (error) {
			if (error instanceof HttpError) {
				logger.error('Dropbox Sign API error:', error.body)
				throw new Error('Failed to send reminder email')
			}

			throw handleFunctionError(error, 'resendWaiverEmail', {
				uid: request.auth?.uid
			})
		}
	}
)
