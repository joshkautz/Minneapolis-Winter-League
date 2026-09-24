/**
 * Send waiver reminder callable function
 *
 * Sends a reminder email for an existing signature request using the Dropbox Sign API.
 * This is the correct and performant way to remind users about pending signatures,
 * as opposed to creating a new signature request.
 *
 * A rostered player with no waiver at all — `onRosterEntryCreated` gave up, or
 * Dropbox Sign was unavailable when they joined — is sent one instead. Without
 * that, a trigger whose retries ran out left the player no way to get a waiver.
 *
 * Security validations performed:
 * - User must be authenticated and email verified
 * - User must not be banned for the current season
 * - User can only send reminders for their own signature requests
 * - A new waiver is issued only to a player on a roster for the current season
 * - Waiver must belong to the authenticated user
 * - Registration must be open (between registrationStart and registrationEnd)
 *
 * @see https://developers.hellosign.com/api/reference/operation/signatureRequestRemind/
 */

import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	WaiverDocument,
	PlayerDocument,
	SeasonDocument,
} from '../../../types.js'
import {
	FIREBASE_CONFIG,
	getDropboxSignConfig,
} from '../../../config/constants.js'
import {
	validateAuthentication,
	validateNotBanned,
} from '../../../shared/auth.js'
import { getCurrentSeason, playerSeasonRef } from '../../../shared/database.js'
import { formatDateForUser } from '../../../shared/format.js'
import {
	describeDropboxSignError,
	requestWaiver,
} from '../../../shared/waivers.js'
import {
	SignatureRequestApi,
	SignatureRequestRemindRequest,
} from '@dropbox/sign'

interface SendWaiverReminderRequest {
	timezone?: string
}

/**
 * Sends a reminder email for an existing Dropbox Sign signature request
 */
export const sendWaiverReminder = onCall<SendWaiverReminderRequest>(
	{
		region: FIREBASE_CONFIG.REGION,
		secrets: ['DROPBOX_SIGN_API_KEY'],
	},
	async (request) => {
		const { auth, data } = request
		const userId = auth?.uid ?? ''
		const timezone = data?.timezone

		try {
			// Validate authentication
			validateAuthentication(auth)

			const firestore = getFirestore()

			// Get the current season
			const currentSeason = (await getCurrentSeason()) as
				(SeasonDocument & { id: string }) | null
			if (!currentSeason) {
				throw new HttpsError('failed-precondition', 'No current season found')
			}
			const seasonId = currentSeason.id

			// Get player document and waiver in parallel
			const playerRef = firestore.collection(Collections.PLAYERS).doc(userId)
			const [playerDoc, waiverQuery] = await Promise.all([
				playerRef.get(),
				firestore
					.collection(Collections.DROPBOX)
					.doc(userId)
					.collection('waivers')
					.where('seasonId', '==', seasonId)
					.limit(1)
					.get(),
			])

			// Validate player exists
			if (!playerDoc.exists) {
				throw new HttpsError('not-found', 'Player not found')
			}

			const playerData = playerDoc.data() as PlayerDocument | undefined
			if (!playerData || !playerData.email) {
				throw new HttpsError('internal', 'Invalid player data')
			}

			// Check if player is banned for current season
			await validateNotBanned(firestore, userId)

			// Validate registration is open (skip for admins)
			const isAdmin = playerData.admin === true
			if (!isAdmin) {
				const now = new Date()
				const registrationStart = currentSeason.registrationStart.toDate()
				const registrationEnd = currentSeason.registrationEnd.toDate()

				if (now < registrationStart) {
					throw new HttpsError(
						'failed-precondition',
						`Registration has not opened yet. Registration opens ${formatDateForUser(registrationStart, timezone)}.`
					)
				}

				if (now > registrationEnd) {
					throw new HttpsError(
						'failed-precondition',
						`Registration has closed. Registration ended ${formatDateForUser(registrationEnd, timezone)}.`
					)
				}
			}

			// No waiver yet: issue one if they are on a team, since joining a
			// roster is what entitles a player to a waiver.
			if (waiverQuery.empty) {
				const playerSeason = await playerSeasonRef(
					firestore,
					userId,
					seasonId
				).get()
				if (!playerSeason.data()?.team) {
					throw new HttpsError(
						'failed-precondition',
						'Your waiver is emailed when you join a team for this season.'
					)
				}

				let issued
				try {
					issued = await requestWaiver(firestore, {
						playerId: userId,
						seasonId,
					})
				} catch (dropboxError) {
					logger.error('Dropbox Sign API error issuing a waiver', {
						userId,
						seasonId,
						error: describeDropboxSignError(dropboxError),
					})
					throw new HttpsError(
						'unavailable',
						'We could not send your waiver right now. Please try again later.'
					)
				}

				if (issued.outcome === 'disabled-in-emulator') {
					throw new HttpsError(
						'failed-precondition',
						'Dropbox Sign is turned off in the local emulator.'
					)
				}
				if (
					issued.outcome !== 'sent' &&
					issued.outcome !== 'already-requested'
				) {
					throw new HttpsError('internal', 'Unable to issue your waiver')
				}

				logger.info('Waiver issued from the resend button', {
					userId,
					seasonId,
					outcome: issued.outcome,
				})
				return {
					success: true,
					message: 'Waiver email sent',
					signatureRequestId:
						issued.outcome === 'sent' ? issued.signatureRequestId : undefined,
				}
			}

			const waiverData = waiverQuery.docs[0].data() as
				WaiverDocument | undefined
			if (!waiverData) {
				throw new HttpsError('internal', 'Invalid waiver data')
			}

			// Check if waiver is already signed
			if (waiverData.status === 'signed') {
				throw new HttpsError(
					'failed-precondition',
					'Waiver has already been signed'
				)
			}

			const signatureRequestId = waiverData.signatureRequestId
			if (!signatureRequestId) {
				throw new HttpsError(
					'not-found',
					'No signature request found for your waiver'
				)
			}

			// Send reminder via Dropbox Sign API
			const dropboxConfig = getDropboxSignConfig()
			const dropbox = new SignatureRequestApi()
			dropbox.username = dropboxConfig.API_KEY

			const reminderRequest: SignatureRequestRemindRequest = {
				emailAddress: playerData.email,
			}

			try {
				await dropbox.signatureRequestRemind(
					signatureRequestId,
					reminderRequest
				)
			} catch (dropboxError) {
				logger.error('Dropbox Sign API error', {
					userId,
					signatureRequestId,
					error: describeDropboxSignError(dropboxError),
				})
				throw new HttpsError(
					'unavailable',
					'We could not resend your waiver right now. Please try again later.'
				)
			}

			logger.info('Waiver reminder email sent', {
				userId,
				signatureRequestId,
				email: playerData.email,
			})

			return {
				success: true,
				message: 'Reminder email sent successfully',
				signatureRequestId,
			}
		} catch (error) {
			// Only log if not already an HttpsError (those are expected user errors)
			if (!(error instanceof HttpsError)) {
				logger.error('Unexpected error sending waiver reminder', {
					userId,
					error: error instanceof Error ? error.message : 'Unknown error',
				})
			}

			// Re-throw HttpsErrors directly
			if (error instanceof HttpsError) {
				throw error
			}

			// Wrap other errors
			throw new HttpsError(
				'internal',
				error instanceof Error ? error.message : 'Failed to send reminder email'
			)
		}
	}
)
