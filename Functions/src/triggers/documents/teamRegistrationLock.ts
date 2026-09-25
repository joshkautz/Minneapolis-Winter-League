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
 * attempt did not finish.
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
import { deleteUnregisteredTeamsForSeasonLock } from '../../services/teamDeletionService.js'
import { settleTeamSeason } from '../../services/teamSettlementService.js'
import { closeOpenCheckouts } from '../../services/teamCheckoutReservations.js'
import { createStripeClient } from '../../shared/stripe.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'

const LOCK_THRESHOLD = TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK

export const onTeamRegistrationChange = onDocumentUpdated(
	{
		document: 'teams/{teamId}/teamSeasons/{seasonId}',
		region: FIREBASE_CONFIG.REGION,
		// A throw is only retried with this set; see .claude/rules/functions.md.
		retry: true,
		secrets: ['STRIPE_SECRET_KEY'],
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

			// The team is in, so its money is kept. A no-op for a season on
			// per-player pricing.
			await settleTeamSeason(teamId, seasonId)

			const currentSeason = await getCurrentSeason()
			if (!currentSeason || currentSeason.id !== seasonId) {
				// Only the current season triggers the lock cascade.
				return
			}

			// Count registered teams in this season via the per-team season subcollection.
			const seasonDocRef = firestore
				.collection(Collections.SEASONS)
				.doc(seasonId)
			const registeredSnapshot = await firestore
				.collectionGroup(TEAM_SEASONS_SUBCOLLECTION)
				.where('season', '==', seasonDocRef)
				.where('registered', '==', true)
				.get()

			const registeredTeamCount = registeredSnapshot.size
			logger.info(`Current registered team count: ${registeredTeamCount}`)

			if (registeredTeamCount !== LOCK_THRESHOLD) {
				return
			}

			logger.info(`${LOCK_THRESHOLD} teams registered! Locking registration...`)

			// Find all UNREGISTERED team-season subdocs for this season.
			const unregisteredSnapshot = await firestore
				.collectionGroup(TEAM_SEASONS_SUBCOLLECTION)
				.where('season', '==', seasonDocRef)
				.where('registered', '==', false)
				.get()

			if (unregisteredSnapshot.empty) return

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
					await settleTeamSeason(pair.teamId, seasonId)
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
						settlementFailures.map((f) => `${f.teamId} (${f.error})`).join('; ')
				)
			}
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
