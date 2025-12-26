/**
 * Payment processing Firebase Functions
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerDocument } from '../../types.js'
import {
	FIREBASE_CONFIG,
	getDropboxSignConfig,
	EMAIL_CONFIG,
} from '../../config/constants.js'
import { handleFunctionError } from '../../shared/errors.js'
import { getCurrentSeason } from '../../shared/database.js'
import { SignatureRequestApi, SubSigningOptions } from '@dropbox/sign'

/**
 * When a payment is created and succeeded, update the player's paid status
 * and send them a Dropbox signature request for the waiver
 *
 * @see https://firebase.google.com/docs/functions/firestore-events#trigger_a_function_when_a_new_document_is_created
 */
export const onPaymentCreated = onDocumentCreated(
	{
		document: 'stripe/{uid}/payments/{paymentId}',
		region: FIREBASE_CONFIG.REGION,
		secrets: ['DROPBOX_SIGN_API_KEY'],
	},
	async (event) => {
		const { uid, paymentId } = event.params

		try {
			logger.info(
				`Processing payment creation for user: ${uid}, payment: ${paymentId}`
			)

			const firestore = getFirestore()
			const dropboxConfig = getDropboxSignConfig()
			const dropbox = new SignatureRequestApi()
			dropbox.username = dropboxConfig.API_KEY

			// Get payment document
			const paymentDoc = await firestore
				.collection('stripe')
				.doc(uid)
				.collection('payments')
				.doc(paymentId)
				.get()

			const paymentData = paymentDoc.data()
			if (!paymentData || paymentData.status !== 'paid') {
				logger.info(`Payment not paid for user: ${uid}`)
				return
			}

			// Get current season and player data
			const [currentSeason, playerDoc] = await Promise.all([
				getCurrentSeason(),
				firestore.collection(Collections.PLAYERS).doc(uid).get(),
			])

			if (!currentSeason) {
				throw new Error('No current season found')
			}

			if (!playerDoc.exists) {
				throw new Error(`Player document not found for UID: ${uid}`)
			}

			const playerDocument = playerDoc.data() as PlayerDocument

			// Check if player is already paid for this season (idempotency check)
			const currentSeasonData = playerDocument.seasons?.find(
				(season) => season.season.id === currentSeason.id
			)

			if (currentSeasonData?.paid) {
				logger.info(
					`Player ${uid} already paid for season ${currentSeason.id}, skipping`
				)
				return
			}

			// Update player's paid status for current season
			const updatedSeasons =
				playerDocument.seasons?.map((season) =>
					season.season.id === currentSeason.id
						? { ...season, paid: true }
						: season
				) || []

			await playerDoc.ref.update({ seasons: updatedSeasons })

			// Check if waiver already exists for this player/season (idempotency check)
			const existingWaiver = await firestore
				.collection(Collections.WAIVERS)
				.where('player', '==', playerDoc.ref)
				.where('season', '==', currentSeason.id)
				.limit(1)
				.get()

			if (!existingWaiver.empty) {
				logger.info(
					`Waiver already exists for player ${uid} in season ${currentSeason.id}, skipping`
				)
				return
			}

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
				testMode: dropboxConfig.TEST_MODE,
			})

			// Create waiver document
			if (signatureResponse.body.signatureRequest?.signatureRequestId) {
				await firestore.collection(Collections.WAIVERS).add({
					player: playerDoc.ref,
					season: currentSeason.id,
					signatureRequestId:
						signatureResponse.body.signatureRequest.signatureRequestId,
					status: 'pending',
					createdAt: new Date(),
				})
			}

			logger.info(
				`Successfully processed payment and created waiver for user: ${uid}`
			)
		} catch (error) {
			throw handleFunctionError(error, 'onPaymentCreated', { uid, paymentId })
		}
	}
)
