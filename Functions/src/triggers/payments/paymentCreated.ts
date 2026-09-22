/**
 * Payment processing Firebase Functions
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections } from '../../types.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { handleFunctionError } from '../../shared/errors.js'
import { getCurrentSeason, playerSeasonRef } from '../../shared/database.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'

/**
 * When a payment is created and succeeded, mark the player paid for the
 * current season.
 *
 * @see https://firebase.google.com/docs/functions/firestore-events#trigger_a_function_when_a_new_document_is_created
 */
export const onPaymentCreated = onDocumentCreated(
	{
		document: 'stripe/{uid}/payments/{paymentId}',
		region: FIREBASE_CONFIG.REGION,
	},
	async (event) => {
		const { uid, paymentId } = event.params

		if (await isMigrationInProgress(getFirestore())) {
			logger.info('Skipping onPaymentCreated — migration in progress', {
				eventId: event.id,
				uid,
				paymentId,
			})
			return
		}

		try {
			logger.info(
				`Processing payment creation for user: ${uid}, payment: ${paymentId}`
			)

			const firestore = getFirestore()

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

			const { alreadyPaid } = await firestore.runTransaction<{
				alreadyPaid: boolean
			}>(async (transaction) => {
				// The player document is still read so a payment for a player
				// who does not exist fails loudly rather than writing a season
				// subdoc under a stranger's uid.
				const playerDoc = await transaction.get(playerRef)
				if (!playerDoc.exists) {
					throw new Error(`Player document not found for UID: ${uid}`)
				}

				const playerSeasonSnap = await transaction.get(playerSeasonDocRef)
				if (playerSeasonSnap.exists && playerSeasonSnap.data()?.paid) {
					return { alreadyPaid: true }
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
						captain: false,
					})
				}

				return { alreadyPaid: false }
			})

			if (alreadyPaid) {
				logger.info(
					`Player ${uid} already paid for season ${currentSeason.id}, skipping`
				)
				return
			}

			logger.info(`Marked player ${uid} paid for season ${currentSeason.id}`)
		} catch (error) {
			throw handleFunctionError(error, 'onPaymentCreated', { uid, paymentId })
		}
	}
)
