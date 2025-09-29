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
		document: 'customers/{uid}/payments/{sid}',
		region: FIREBASE_CONFIG.REGION,
		secrets: ['DROPBOX_SIGN_API_KEY'],
	},
	async (event) => {
		const { uid, sid } = event.params

		try {
			logger.info(
				`Processing payment creation for user: ${uid}, payment: ${sid}`
			)

			const firestore = getFirestore()
			const dropboxConfig = getDropboxSignConfig()
			const dropbox = new SignatureRequestApi()
			dropbox.username = dropboxConfig.API_KEY

			// Get payment document
			const paymentDoc = await firestore
				.collection('customers')
				.doc(uid)
				.collection('payments')
				.doc(sid)
				.get()

			logger.info(
				`Made it to breakpoint 0 for user: ${uid} (${dropbox.username})`
			)

			const paymentData = paymentDoc.data()
			if (!paymentData || paymentData.status !== 'succeeded') {
				logger.info(`Payment not succeeded for user: ${uid}`)
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

			// Update player's paid status for current season
			const updatedSeasons =
				playerDocument.seasons?.map((season) =>
					season.season.id === currentSeason.id
						? { ...season, paid: true }
						: season
				) || []

			await playerDoc.ref.update({ seasons: updatedSeasons })

			logger.info(`Made it to breakpoint 1 for user: ${uid}`)

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

			logger.info(`Made it to breakpoint 2 for user: ${uid}`, signatureResponse)

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

				logger.info(`Made it to breakpoint 3 for user: ${uid}`)
			}

			logger.info(
				`Successfully processed payment and created waiver for user: ${uid}`
			)
		} catch (error) {
			throw handleFunctionError(error, 'onPaymentCreated', { uid, sid })
		}
	}
)
