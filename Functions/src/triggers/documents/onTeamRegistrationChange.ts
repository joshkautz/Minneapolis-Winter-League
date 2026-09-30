/**
 * Team registration lock trigger
 *
 * Fires when a team's per-season registration flag flips from false → true.
 *
 * 1. Settles that team's money. Under team payments this is where a team
 *    that paid more than its total is refunded the excess, latest payments
 *    first.
 * 2. When the threshold (12 registered teams) is reached, refunds every
 *    unregistered team's money and then deletes those team-seasons. The
 *    refund has to come first — deletion refuses a team still holding
 *    money — and a team whose refund fails is left in place for the retry
 *    rather than deleted with its money unaccounted for.
 *
 * Retried on failure. Both steps are idempotent: settlement reads Stripe
 * before refunding, and the cascade only ever finds the teams a previous
 * attempt did not finish. The two are independent: a failure settling the
 * newly registered team does not hold up everyone else's refunds, and both
 * failures are thrown together at the end.
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	TEAM_SEASONS_SUBCOLLECTION,
	TeamSeasonDocument,
} from '../../types.js'
import { FIREBASE_CONFIG, TEAM_CONFIG } from '../../config/constants.js'
import {
	canonicalTeamIdFromTeamSeasonDoc,
	getCurrentSeason,
} from '../../shared/database.js'
import { deleteUnregisteredTeamsForSeasonLock } from '../../services/teamDeletion.js'
import { settleTeamSeason } from '../../services/teamSettlement.js'
import { closeOpenCheckouts } from '../../services/teamCheckoutReservations.js'
import { createStripeClient } from '../../shared/stripe.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'
import {
	queueTeamMissedOutEmails,
	queueTeamRegisteredEmails,
} from '../../email/teamRegistrationEmails.js'
import { teamContributionsCollection } from '../../shared/contributions.js'

/** Whether anyone's money is still paid toward the team. */
async function holdsPaidMoney(
	firestore: FirebaseFirestore.Firestore,
	{ teamId, seasonId }: { teamId: string; seasonId: string }
): Promise<boolean> {
	const paid = await teamContributionsCollection(firestore, teamId, seasonId)
		.where('status', '==', 'paid')
		.limit(1)
		.get()
	return !paid.empty
}

const LOCK_THRESHOLD = TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK

export const onTeamRegistrationChange = onDocumentUpdated(
	{
		document: 'teams/{teamId}/teamSeasons/{seasonId}',
		region: FIREBASE_CONFIG.REGION,
		// A throw is only retried with this set; see .claude/rules/functions.md.
		retry: true,
		secrets: ['STRIPE_SECRET_KEY'],
		// The cascade refunds every team that missed out, one Stripe call
		// after another, which the 60-second default does not leave room for.
		timeoutSeconds: 540,
	},
	async (event) => {
		const { teamId: paramTeamId, seasonId: paramSeasonId } = event.params

		if (await isMigrationInProgress(getFirestore())) {
			logger.info('Skipping onTeamRegistrationChange — migration in progress', {
				eventId: event.id,
				teamId: paramTeamId,
				seasonId: paramSeasonId,
			})
			return
		}

		const beforeData = event.data?.before.data() as
			TeamSeasonDocument | undefined
		const afterData = event.data?.after.data() as TeamSeasonDocument | undefined

		// Only process when registration flips from false → true.
		if (beforeData?.registered !== false || afterData?.registered !== true) {
			return
		}

		const { teamId, seasonId } = event.params
		logger.info(`Team became registered: ${teamId}/${seasonId}`)

		try {
			const firestore = getFirestore()

			// The team is in: its players are told, and its money is kept (a
			// no-op for a season on per-player pricing). A failure in either is
			// thrown at the end, after the cascade, so it cannot hold up the
			// other teams' refunds.
			// Only the current season's registrations are news; an admin
			// correcting an old season must not email its roster.
			const currentSeason = await getCurrentSeason()
			const isCurrentSeason = currentSeason?.id === seasonId
			let ownSettlementError: unknown = null
			try {
				if (isCurrentSeason) {
					await queueTeamRegisteredEmails(firestore, { teamId, seasonId })
				}
				await settleTeamSeason(teamId, seasonId)
			} catch (error) {
				ownSettlementError = error
			}
			const rethrowOwn = (): void => {
				if (ownSettlementError) throw ownSettlementError
			}

			if (!currentSeason || !isCurrentSeason) {
				// Only the current season triggers the lock cascade.
				return rethrowOwn()
			}

			// The season's own count of claimed spots, which only registration
			// changes and never gives back; a recount of registered teams
			// would drop if one were later deleted or merged.
			const registeredTeamCount = currentSeason.registeredTeamCount ?? 0
			logger.info(`Current registered team count: ${registeredTeamCount}`)

			if (registeredTeamCount < LOCK_THRESHOLD) {
				return rethrowOwn()
			}
			const seasonDocRef = firestore
				.collection(Collections.SEASONS)
				.doc(seasonId)

			logger.info(`${LOCK_THRESHOLD} teams registered! Locking registration...`)

			// Find all UNREGISTERED team-season subdocs for this season.
			const unregisteredSnapshot = await firestore
				.collectionGroup(TEAM_SEASONS_SUBCOLLECTION)
				.where('season', '==', seasonDocRef)
				.where('registered', '==', false)
				.get()

			if (unregisteredSnapshot.empty) return rethrowOwn()

			const pairs = unregisteredSnapshot.docs.map((d) => ({
				teamId: canonicalTeamIdFromTeamSeasonDoc(
					d as FirebaseFirestore.QueryDocumentSnapshot<TeamSeasonDocument>
				),
				seasonId,
			}))

			// Give back every unregistered team's money before deleting it,
			// closing any checkout still open first so nobody pays for a team
			// that is out — and anything paid in the meantime is taken in and
			// refunded with the rest. Each is settled on its own so one
			// failure does not stop the others; a team that fails keeps its
			// team-season until the retry.
			const stripe = createStripeClient()
			const settled: typeof pairs = []
			const settlementFailures: { teamId: string; error: string }[] = []
			for (const pair of pairs) {
				try {
					await closeOpenCheckouts(firestore, stripe, pair)
					const refunding = await holdsPaidMoney(firestore, pair)
					await settleTeamSeason(pair.teamId, seasonId)
					// Told before the team is deleted, while its roster is there.
					await queueTeamMissedOutEmails(firestore, {
						...pair,
						reason: 'season-full',
						refunding,
					})
					settled.push(pair)
				} catch (error) {
					settlementFailures.push({
						teamId: pair.teamId,
						error: error instanceof Error ? error.message : 'Unknown error',
					})
				}
			}

			logger.info(`Deleting ${settled.length} unregistered team-seasons...`)

			const results = await deleteUnregisteredTeamsForSeasonLock(
				firestore,
				settled
			)

			const successCount = results.filter((r) => r.success).length
			const failCount = results.filter((r) => !r.success).length
			logger.info('Completed unregistered team deletion', {
				successCount,
				failCount,
				deletedTeams: results
					.filter((r) => r.success)
					.map((r) => ({ id: r.teamId, name: r.teamName })),
				failedTeams: results
					.filter((r) => !r.success)
					.map((r) => ({ id: r.teamId, name: r.teamName, error: r.error })),
			})

			if (settlementFailures.length > 0) {
				throw new Error(
					`Could not refund the money of ${settlementFailures.length} ` +
						`unregistered team(s): ` +
						settlementFailures
							.map((f) => `${f.teamId} (${f.error})`)
							.join('; ') +
						(ownSettlementError
							? `; and could not settle the registered team: ${
									ownSettlementError instanceof Error
										? ownSettlementError.message
										: String(ownSettlementError)
								}`
							: '')
				)
			}
			rethrowOwn()
		} catch (error) {
			// Rethrown so the platform retries. Money kept from a team that is
			// out of the season is exactly what this must not do.
			logger.error('Error processing team registration lock:', {
				teamId,
				seasonId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw error
		}
	}
)
