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

			// Get current season
			const currentSeason = await getCurrentSeason()
			if (!currentSeason) {
				throw new Error('No current season found')
			}

			// Use transaction to atomically check and update paid status
			// This prevents race conditions where multiple payment triggers
			// could both pass the idempotency check
			const playerRef = firestore.collection(Collections.PLAYERS).doc(uid)

			const { alreadyPaid, playerDocument } = await firestore.runTransaction(
				async (transaction) => {
					const playerDoc = await transaction.get(playerRef)

					if (!playerDoc.exists) {
						throw new Error(`Player document not found for UID: ${uid}`)
					}

					const playerData = playerDoc.data() as PlayerDocument

					// Check if player is already paid for this season (idempotency check)
					const currentSeasonData = playerData.seasons?.find(
						(season) => season.season.id === currentSeason.id
					)

					if (currentSeasonData?.paid) {
						// Already paid - return early from transaction
						return { alreadyPaid: true, playerDocument: playerData }
					}

					// Update player's paid status for current season atomically
					const updatedSeasons =
						playerData.seasons?.map((season) =>
							season.season.id === currentSeason.id
								? { ...season, paid: true }
								: season
						) || []

					transaction.update(playerRef, { seasons: updatedSeasons })

					return { alreadyPaid: false, playerDocument: playerData }
				}
			)

			if (alreadyPaid) {
				logger.info(
					`Player ${uid} already paid for season ${currentSeason.id}, skipping`
				)
				return
			}

			// Check if waiver already exists for this player/season (idempotency check)
			const existingWaiver = await firestore
				.collection(Collections.DROPBOX)
				.doc(uid)
				.collection('waivers')
				.where('seasonId', '==', currentSeason.id)
				.limit(1)
				.get()

			if (!existingWaiver.empty) {
				logger.info(
					`Waiver already exists for player ${uid} in season ${currentSeason.id}, skipping`
				)
				return
			}

			// Send Dropbox signature request with metadata for webhook lookup
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
					firebaseUID: uid,
					seasonId: currentSeason.id,
				},
				testMode: dropboxConfig.TEST_MODE,
			})

			// Create waiver document in dropbox/{uid}/waivers subcollection
			if (signatureResponse.body.signatureRequest?.signatureRequestId) {
				await firestore
					.collection(Collections.DROPBOX)
					.doc(uid)
					.collection('waivers')
					.add({
						seasonId: currentSeason.id,
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
