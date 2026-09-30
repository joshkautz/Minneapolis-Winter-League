/**
 * Send the new-season announcement callable function
 *
 * Queues the announcement for a season, built from its own dates,
 * to the test recipients or to everyone who has ever played.
 *
 * Security validations:
 * - Caller must be an admin
 * - The season must exist and use team pricing
 * - To players: email must be live (`system/email.mode`), and the league's
 *   postal address set, as CAN-SPAM requires; a dry run only counts
 * - To test recipients: email must be in test or live mode
 * - Each player is queued once per season, however often this is called
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { validateAdminUser } from '../../../shared/auth.js'
import { EMAIL_CONFIG, FIREBASE_CONFIG } from '../../../config/constants.js'
import { Collections, type SeasonDocument } from '../../../types.js'
import {
	announcementRecipients,
	AnnouncementNotReadyError,
	seasonAnnouncementProps,
} from '../../../email/announcement.js'
import { mailDocument, mailRef } from '../../../email/outbox.js'
import { readEmailSettings } from '../../../email/settings.js'

interface SendSeasonAnnouncementRequest {
	seasonId: string
	audience: 'test' | 'players'
	/** Players only: count the recipients without queueing anything. */
	dryRun?: boolean
}

interface SendSeasonAnnouncementResponse {
	recipients: number
	queued: number
	/** Already queued by an earlier call, and not queued again. */
	alreadyQueued: number
}

/** Firestore's code for creating a document that already exists. */
const ALREADY_EXISTS = 6

export const sendSeasonAnnouncement = onCall<SendSeasonAnnouncementRequest>(
	{ region: FIREBASE_CONFIG.REGION, timeoutSeconds: 300 },
	async (request): Promise<SendSeasonAnnouncementResponse> => {
		const firestore = getFirestore()
		await validateAdminUser(request.auth, firestore)

		const { seasonId, audience, dryRun = false } = request.data
		if (typeof seasonId !== 'string' || !seasonId) {
			throw new HttpsError('invalid-argument', 'Choose a season.')
		}
		if (audience !== 'test' && audience !== 'players') {
			throw new HttpsError(
				'invalid-argument',
				'Send to the test recipients or to players.'
			)
		}

		const season = (
			await firestore.collection(Collections.SEASONS).doc(seasonId).get()
		).data() as SeasonDocument | undefined
		if (!season)
			throw new HttpsError('not-found', 'That season does not exist.')
		let props
		try {
			props = seasonAnnouncementProps(season)
		} catch (error) {
			if (error instanceof AnnouncementNotReadyError) {
				throw new HttpsError('failed-precondition', error.message)
			}
			logger.error('Could not build the season announcement', error, {
				seasonId,
			})
			throw new HttpsError(
				'internal',
				'The announcement could not be prepared. Please try again.'
			)
		}

		const settings = await readEmailSettings(firestore)

		if (audience === 'test') {
			if (settings.mode === 'off' || settings.testRecipients.length === 0) {
				throw new HttpsError(
					'failed-precondition',
					'Email is off or has no test recipients. Set system/email first.'
				)
			}
			const batch = firestore.batch()
			for (const address of settings.testRecipients) {
				batch.create(
					mailRef(firestore),
					mailDocument({
						to: { address },
						template: 'seasonAnnouncement',
						props,
					})
				)
			}
			await batch.commit()
			const count = settings.testRecipients.length
			return { recipients: count, queued: count, alreadyQueued: 0 }
		}

		const playerIds = await announcementRecipients(firestore)
		if (dryRun) {
			return { recipients: playerIds.length, queued: 0, alreadyQueued: 0 }
		}
		if (settings.mode !== 'live') {
			throw new HttpsError(
				'failed-precondition',
				'Email is not live. Nothing goes to players until system/email.mode is "live".'
			)
		}
		if (!EMAIL_CONFIG.POSTAL_ADDRESS) {
			throw new HttpsError(
				'failed-precondition',
				'Announcements need the league’s postal address, which is not set.'
			)
		}

		let queued = 0
		let alreadyQueued = 0
		const writer = firestore.bulkWriter()
		writer.onWriteError((error) => {
			if (error.code === ALREADY_EXISTS) return false
			return error.failedAttempts < 5
		})
		const writes = playerIds.map((playerId) =>
			writer
				.create(
					mailRef(firestore, `seasonAnnouncement-${seasonId}-${playerId}`),
					mailDocument({
						to: { playerId },
						template: 'seasonAnnouncement',
						props,
					})
				)
				.then(
					() => queued++,
					(error: { code?: number }) => {
						if (error.code === ALREADY_EXISTS) alreadyQueued++
						else throw error
					}
				)
		)
		await writer.close()
		const failed = (await Promise.allSettled(writes)).filter(
			(result) => result.status === 'rejected'
		).length
		if (failed > 0) {
			logger.error('Announcement not queued for some players', { failed })
			throw new HttpsError(
				'internal',
				`The announcement was queued for ${queued} players but not ${failed}. Run it again to queue the rest; nobody is sent it twice.`
			)
		}
		logger.info('Season announcement queued', {
			seasonId,
			queued,
			alreadyQueued,
		})
		return { recipients: playerIds.length, queued, alreadyQueued }
	}
)
