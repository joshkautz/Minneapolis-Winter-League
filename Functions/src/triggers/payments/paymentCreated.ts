/**
 * Payment processing Firebase Functions
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections } from '../../types.js'
import {
	FIREBASE_CONFIG,
	getDropboxSignConfig,
	EMAIL_CONFIG,
} from '../../config/constants.js'
import { handleFunctionError } from '../../shared/errors.js'
import { getCurrentSeason, playerSeasonRef } from '../../shared/database.js'
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

			// Atomically check + update the player's per-season paid flag.
			const playerRef = firestore.collection(Collections.PLAYERS).doc(uid)
			const playerSeasonDocRef = playerSeasonRef(
				firestore,
				uid,
				currentSeason.id
			)

			type PlayerForWaiver = {
				firstname: string
				lastname: string
				email: string
			}

			const { alreadyPaid, playerDocument } = await firestore.runTransaction<{
				alreadyPaid: boolean
				playerDocument: PlayerForWaiver
			}>(async (transaction) => {
				const playerDoc = await transaction.get(playerRef)
				if (!playerDoc.exists) {
					throw new Error(`Player document not found for UID: ${uid}`)
				}
				const playerData = playerDoc.data() as PlayerForWaiver

				const playerSeasonSnap = await transaction.get(playerSeasonDocRef)
				if (playerSeasonSnap.exists && playerSeasonSnap.data()?.paid) {
					return { alreadyPaid: true, playerDocument: playerData }
				}

				if (playerSeasonSnap.exists) {
					transaction.update(playerSeasonDocRef, { paid: true })
				} else {
					// Defensive: create the subdoc if a Stripe payment lands before
					// the season has otherwise been seeded for this player.
					transaction.set(playerSeasonDocRef, {
						season: firestore
							.collection(Collections.SEASONS)
							.doc(currentSeason.id),
						team: null,
						paid: true,
						signed: false,
						banned: false,
						captain: false,
					})
				}

				return { alreadyPaid: false, playerDocument: playerData }
			})

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
