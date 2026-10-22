/**
 * Remind unsigned teammates callable function
 *
 * A captain emails every player on their team who has not signed the
 * current season's waiver, asking them to sign. A team may send one round
 * a day, whichever of its captains sends it, so a roster is nudged rather
 * than flooded. The emails are `registration` email, which a player can
 * turn off, and go through the outbox like every other.
 *
 * Security validations:
 * - Caller must be authenticated with a verified email, and not banned
 * - A season must exist and must not have ended
 * - Caller must be a captain of `teamId` this season, read in the
 *   transaction that sends
 * - The team must not have sent reminders in the last day
 * - Only players on that team's roster this season are emailed
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import {
	validateAuthentication,
	validateNotBanned,
} from '../../../shared/auth.js'
import {
	getCurrentSeason,
	playerSeasonRef,
	teamSeasonRef,
} from '../../../shared/database.js'
import { MIN_SIGNED_PLAYERS } from '../../../shared/teamPaymentRules.js'
import { queueEmailInTransaction } from '../../../email/outbox.js'
import {
	nextReminderAt,
	reminderRecipients,
	reminderTimeText,
	waiverReminderEmail,
} from '../../../email/waiverReminder.js'
import {
	Collections,
	ROSTER_SUBCOLLECTION,
	type PlayerDocument,
	type PlayerSeasonDocument,
	type SeasonDocument,
	type TeamRosterDocument,
	type TeamSeasonDocument,
} from '../../../types.js'
import { displayName } from '../../../shared/nameRules.js'

interface RemindUnsignedTeammatesRequest {
	teamId: string
}

export interface RemindUnsignedTeammatesResponse {
	/** How many teammates were emailed. */
	sent: number
	/** When the team may send reminders again, as an ISO string. */
	nextReminderAt: string
}

export const remindUnsignedTeammates = onCall<RemindUnsignedTeammatesRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<RemindUnsignedTeammatesResponse> => {
		validateAuthentication(request.auth)
		const captainId = request.auth.uid
		const { teamId } = request.data ?? {}
		if (typeof teamId !== 'string' || teamId.length === 0) {
			throw new HttpsError('invalid-argument', 'Choose a team.')
		}

		const firestore = getFirestore()
		await validateNotBanned(firestore, captainId)

		const season = (await getCurrentSeason()) as
			(SeasonDocument & { id: string }) | null
		if (!season) {
			throw new HttpsError('failed-precondition', 'No current season found.')
		}
		const now = new Date()
		if (season.dateEnd && season.dateEnd.toMillis() < now.getTime()) {
			throw new HttpsError(
				'failed-precondition',
				`${season.name} has ended, so there is no waiver left to sign.`
			)
		}

		const captainSnap = await firestore
			.collection(Collections.PLAYERS)
			.doc(captainId)
			.get()
		const captain = captainSnap.data() as PlayerDocument | undefined
		const captainName = captain ? displayName(captain) : 'Your captain'

		const teamSeasonDocRef = teamSeasonRef(firestore, teamId, season.id)
		const rosterRef = teamSeasonDocRef.collection(ROSTER_SUBCOLLECTION)

		// Everything the decision rests on — the captaincy, the last send and
		// who has signed — is read in the transaction that records the send,
		// so two captains pressing at once send one round between them.
		const sent = await firestore.runTransaction(async (txn) => {
			const callerSeason = (
				await txn.get(playerSeasonRef(firestore, captainId, season.id))
			).data() as PlayerSeasonDocument | undefined
			if (callerSeason?.team?.id !== teamId || callerSeason.captain !== true) {
				throw new HttpsError(
					'permission-denied',
					'Only a captain of this team can remind its players.'
				)
			}

			const teamSeasonSnap = await txn.get(teamSeasonDocRef)
			const teamSeason = teamSeasonSnap.data() as TeamSeasonDocument | undefined
			if (!teamSeason) {
				throw new HttpsError(
					'not-found',
					`This team is not playing in ${season.name}.`
				)
			}

			const lastSent = teamSeason.waiverReminderSentAt?.toDate()
			if (lastSent && nextReminderAt(lastSent) > now) {
				throw new HttpsError(
					'resource-exhausted',
					`Your teammates were last reminded on ${reminderTimeText(lastSent)}. You can send another reminder after ${reminderTimeText(nextReminderAt(lastSent))}.`
				)
			}

			const playerIds = (await txn.get(rosterRef)).docs.map(
				(doc) => (doc.data() as TeamRosterDocument).player?.id ?? doc.id
			)
			const seasons =
				playerIds.length === 0
					? []
					: await txn.getAll(
							...playerIds.map((playerId) =>
								playerSeasonRef(firestore, playerId, season.id)
							)
						)
			const roster = playerIds.map((playerId, index) => ({
				playerId,
				signed:
					(seasons[index]?.data() as PlayerSeasonDocument | undefined)
						?.signed === true,
			}))
			const recipients = reminderRecipients(roster, captainId)
			if (recipients.length === 0) {
				throw new HttpsError(
					'failed-precondition',
					`Everyone on ${teamSeason.name} has signed the waiver.`
				)
			}

			const props = {
				teamName: teamSeason.name,
				seasonName: season.name,
				captainName,
				teamRegistered: teamSeason.registered === true,
				signedPlayers: roster.filter((member) => member.signed).length,
				signedPlayersNeeded: MIN_SIGNED_PLAYERS,
			}
			for (const playerId of recipients) {
				queueEmailInTransaction(
					txn,
					firestore,
					waiverReminderEmail({
						teamId,
						seasonId: season.id,
						playerId,
						sentAt: now,
						props,
					})
				)
			}
			txn.update(teamSeasonDocRef, {
				waiverReminderSentAt: Timestamp.fromDate(now),
			})
			return recipients.length
		})

		logger.info('Waiver reminders sent', {
			captainId,
			teamId,
			seasonId: season.id,
			sent,
		})
		return { sent, nextReminderAt: nextReminderAt(now).toISOString() }
	}
)
