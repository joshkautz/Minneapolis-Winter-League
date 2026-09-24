/**
 * Send waiver (admin) callable function
 *
 * Allows admins to manually send a waiver signature request to a player —
 * one whose automatic waiver went astray, or who paid cash.
 *
 * Security validations:
 * - User must be authenticated with verified email
 * - User must have admin privileges
 * - Target player must exist
 * - Player must be on a team for the season, or marked as paid for it
 * - A waiver must not already exist for this player/season
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	PLAYER_SEASONS_SUBCOLLECTION,
	PlayerDocument,
	SeasonDocument,
} from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { requestWaiver } from '../../../shared/waivers.js'

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

			// A waiver is for a player taking part in the season: on a team —
			// waivers go out on joining one, under either pricing model, and
			// under team payments nobody is individually paid — or paid, which
			// covers someone who paid cash before finding a team.
			const playerSeasonSnap = await firestore
				.collection(Collections.PLAYERS)
				.doc(playerId)
				.collection(PLAYER_SEASONS_SUBCOLLECTION)
				.doc(seasonId)
				.get()
			const playerSeasonData = playerSeasonSnap.data()

			if (!playerSeasonData?.team && !playerSeasonData?.paid) {
				throw new HttpsError(
					'failed-precondition',
					`Player is neither on a team nor marked as paid for season ` +
						`"${seasonDocument?.name || seasonId}". Add them to a team or ` +
						'mark them as paid before sending a waiver.'
				)
			}

			// The shared helper owns the Dropbox Sign call and the waiver
			// document, and is idempotent on (player, season). The admin path
			// reports an existing waiver as an error rather than silently
			// doing nothing, since an admin asked for it explicitly.
			const result = await requestWaiver(firestore, { playerId, seasonId })

			if (result.outcome === 'already-requested') {
				throw new HttpsError(
					'already-exists',
					'A waiver already exists for this player and season. ' +
						'Use the "Send Reminder" function if you need to resend the waiver email.'
				)
			}
			if (result.outcome === 'no-player') {
				throw new HttpsError(
					'not-found',
					'Player not found, or they have no email address on file.'
				)
			}
			if (result.outcome === 'no-signature-request-id') {
				throw new HttpsError(
					'internal',
					'Failed to create signature request - no ID returned from Dropbox Sign'
				)
			}

			logger.info('Admin sent waiver to player', {
				adminId: auth?.uid,
				playerId,
				seasonId,
				signatureRequestId: result.signatureRequestId,
				playerEmail: playerDocument.email,
			})

			return {
				success: true,
				playerId,
				seasonId,
				signatureRequestId: result.signatureRequestId,
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
