/**
 * Dropbox Sign webhook handler
 *
 * Handles webhook events from Dropbox Sign for waiver signature tracking.
 * Supported events:
 * - SignatureRequestSigned: Updates waiver and player status to signed
 * - SignatureRequestDeclined: Marks waiver as declined
 * - SignatureRequestCanceled: Marks waiver as canceled
 */

import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	WaiverDocument,
	WaiverStatus,
	PlayerDocument,
} from '../../types.js'
import {
	FIREBASE_CONFIG,
	getDropboxSignConfig,
} from '../../config/constants.js'
import { handleFunctionError } from '../../shared/errors.js'
import {
	EventCallbackRequest,
	EventCallbackRequestEvent,
	EventCallbackHelper,
} from '@dropbox/sign'

const { EventTypeEnum } = EventCallbackRequestEvent

/**
 * Webhook handler for Dropbox Sign events
 */
export const dropboxSignWebhook = onRequest(
	{
		region: FIREBASE_CONFIG.REGION,
		secrets: ['DROPBOX_SIGN_API_KEY'],
		invoker: 'public',
	},
	async (req, resp) => {
		try {
			// Parse webhook payload - Dropbox sends multipart form data
			const data = req.body.toString().match(/\{.*\}/s)?.[0]
			if (!data) {
				logger.error('Invalid webhook data received')
				resp.status(400).send('Invalid data')
				return
			}

			const callbackData = JSON.parse(data)
			const callbackEvent = EventCallbackRequest.init(callbackData)

			// Verify webhook signature
			const dropboxConfig = getDropboxSignConfig()
			if (!EventCallbackHelper.isValid(dropboxConfig.API_KEY, callbackEvent)) {
				logger.error('Invalid webhook signature')
				resp.status(401).send('Unauthorized')
				return
			}

			const eventType = callbackEvent.event.eventType
			const signatureRequest = callbackEvent.signatureRequest
			const signatureRequestId = signatureRequest?.signatureRequestId

			if (!signatureRequestId) {
				logger.warn('Webhook received without signatureRequestId', {
					eventType,
				})
				resp.status(200).send('Hello API Event Received')
				return
			}

			// Extract metadata passed when creating the signature request
			const metadata = signatureRequest?.metadata as
				| { firebaseUID?: string; seasonId?: string }
				| undefined
			const firebaseUID = metadata?.firebaseUID
			const seasonId = metadata?.seasonId

			if (!firebaseUID || !seasonId) {
				logger.warn('Webhook missing required metadata', {
					signatureRequestId,
					eventType,
					hasFirebaseUID: !!firebaseUID,
					hasSeasonId: !!seasonId,
				})
				resp.status(200).send('Hello API Event Received')
				return
			}

			// Handle different event types
			switch (eventType) {
				case EventTypeEnum.SignatureRequestSigned:
					await handleWaiverStatusChange(
						firebaseUID,
						seasonId,
						signatureRequestId,
						'signed',
						true
					)
					break

				case EventTypeEnum.SignatureRequestDeclined:
					await handleWaiverStatusChange(
						firebaseUID,
						seasonId,
						signatureRequestId,
						'declined',
						false
					)
					break

				case EventTypeEnum.SignatureRequestCanceled:
					await handleWaiverStatusChange(
						firebaseUID,
						seasonId,
						signatureRequestId,
						'canceled',
						false
					)
					break

				default:
					logger.info('Unhandled Dropbox Sign event type', { eventType })
			}

			resp.status(200).send('Hello API Event Received')
		} catch (error) {
			logger.error('Error processing Dropbox Sign webhook:', error)
			resp.status(500).send('Internal server error')
		}
	}
)

/**
 * Handles waiver status changes from Dropbox Sign events
 *
 * Uses a transaction to atomically check and update both waiver and player
 * documents, preventing race conditions from duplicate webhook deliveries.
 *
 * @param firebaseUID - The Firebase user ID from metadata
 * @param seasonId - The season ID from metadata
 * @param signatureRequestId - The Dropbox Sign signature request ID
 * @param newStatus - The new waiver status to set
 * @param updatePlayerSigned - Whether to update the player's signed status
 */
async function handleWaiverStatusChange(
	firebaseUID: string,
	seasonId: string,
	signatureRequestId: string,
	newStatus: WaiverStatus,
	updatePlayerSigned: boolean
): Promise<void> {
	const firestore = getFirestore()

	try {
		// Find the waiver document in the user's subcollection
		// Query must be done outside transaction, but we'll re-read inside
		const waiverQuery = await firestore
			.collection(Collections.DROPBOX)
			.doc(firebaseUID)
			.collection('waivers')
			.where('signatureRequestId', '==', signatureRequestId)
			.limit(1)
			.get()

		if (waiverQuery.empty) {
			logger.warn(
				`No waiver found for signature request: ${signatureRequestId}`
			)
			return
		}

		const waiverRef = waiverQuery.docs[0].ref
		const playerRef = firestore.collection(Collections.PLAYERS).doc(firebaseUID)

		// Use transaction to atomically check status and update both documents
		// This prevents race conditions when duplicate webhooks arrive
		const result = await firestore.runTransaction(async (transaction) => {
			// IMPORTANT: All reads must happen before any writes in Firestore transactions
			// Re-read waiver inside transaction to get fresh data
			const waiverDoc = await transaction.get(waiverRef)
			const waiverData = waiverDoc.data() as WaiverDocument | undefined

			if (!waiverData) {
				return { skipped: true, reason: 'invalid_waiver_data' }
			}

			const waiverAlreadyInStatus = waiverData.status === newStatus

			// Read player document BEFORE any writes (Firestore transaction requirement)
			// Always read player to check if they need updating, even if waiver is already signed
			let playerDocument: PlayerDocument | undefined
			let playerNeedsUpdate = false
			if (updatePlayerSigned && newStatus === 'signed') {
				const playerDoc = await transaction.get(playerRef)
				if (playerDoc.exists) {
					playerDocument = playerDoc.data() as PlayerDocument | undefined
					// Check if player's signed status needs updating
					const playerSeasonData = playerDocument?.seasons?.find(
						(season) => season.season.id === seasonId
					)
					playerNeedsUpdate = playerSeasonData?.signed !== true
				}
			}

			// If waiver is already in target status AND player doesn't need update, skip
			if (waiverAlreadyInStatus && !playerNeedsUpdate) {
				return { skipped: true, reason: 'already_in_status' }
			}

			// Now perform all writes after reads are complete
			// Update waiver status (only if not already in target status)
			if (!waiverAlreadyInStatus) {
				const updateData: Record<string, unknown> = {
					status: newStatus,
				}

				// Add signedAt timestamp only for signed status
				if (newStatus === 'signed') {
					updateData.signedAt = FieldValue.serverTimestamp()
				}

				transaction.update(waiverRef, updateData)
			}

			// Update player's signed status if needed (only for signed events)
			if (playerNeedsUpdate && playerDocument) {
				const updatedSeasons =
					playerDocument.seasons?.map((season) =>
						season.season.id === seasonId ? { ...season, signed: true } : season
					) || []

				transaction.update(playerRef, { seasons: updatedSeasons })
				logger.info(`Updated player signed status for season: ${seasonId}`)
			}

			return {
				skipped: false,
				waiverUpdated: !waiverAlreadyInStatus,
				playerUpdated: playerNeedsUpdate,
			}
		})

		if (result.skipped) {
			if (result.reason === 'already_in_status') {
				logger.info(`Waiver already ${newStatus}: ${signatureRequestId}`)
			} else {
				logger.error('Invalid waiver data')
			}
			return
		}

		logger.info(`Waiver ${newStatus} for: ${signatureRequestId}`, {
			playerId: firebaseUID,
			seasonId,
		})
	} catch (error) {
		throw handleFunctionError(error, 'handleWaiverStatusChange', {
			firebaseUID,
			seasonId,
			signatureRequestId,
			newStatus,
		})
	}
}
