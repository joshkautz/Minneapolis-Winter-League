/**
 * Team registration lock trigger
 *
 * Triggers when a team's registration status changes. When the configured
 * number of teams are fully registered for the current season, all remaining
 * unregistered teams are deleted (their players are detached from those
 * teams as a side effect of the deletion service).
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, TeamDocument } from '../../types.js'
import { FIREBASE_CONFIG, TEAM_CONFIG } from '../../config/constants.js'
import { getCurrentSeason } from '../../shared/database.js'
import { deleteUnregisteredTeamsForSeasonLock } from '../../services/teamDeletionService.js'

const LOCK_THRESHOLD = TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK

/**
 * Triggered when a team document is updated and registration status changes.
 * When the lock threshold is reached, deletes all unregistered teams in the
 * current season.
 */
export const onTeamRegistrationChange = onDocumentUpdated(
	{
		document: 'teams/{teamId}',
		region: FIREBASE_CONFIG.REGION,
	},
	async (event) => {
		const beforeData = event.data?.before.data() as TeamDocument | undefined
		const afterData = event.data?.after.data() as TeamDocument | undefined

		// Only process when registration status changes from false to true
		if (beforeData?.registered !== false || afterData?.registered !== true) {
			return
		}

		const teamId = event.params.teamId
		logger.info(`Team became registered: ${teamId}`)

		try {
			const firestore = getFirestore()
			const currentSeason = await getCurrentSeason()

			if (!currentSeason) {
				logger.error('No current season found')
				return
			}

			// Count how many teams are currently registered for this season
			const teamsSnapshot = await firestore
				.collection(Collections.TEAMS)
				.where(
					'season',
					'==',
					firestore.collection(Collections.SEASONS).doc(currentSeason.id)
				)
				.where('registered', '==', true)
				.get()

			const registeredTeamCount = teamsSnapshot.size

			logger.info(`Current registered team count: ${registeredTeamCount}`)

			if (registeredTeamCount !== LOCK_THRESHOLD) {
				return
			}

			logger.info(
				`${LOCK_THRESHOLD} teams registered! Locking registration...`
			)

			// Delete all unregistered teams for this season. The deletion service
			// also clears team references from players on those teams.
			const unregisteredTeamsSnapshot = await firestore
				.collection(Collections.TEAMS)
				.where(
					'season',
					'==',
					firestore.collection(Collections.SEASONS).doc(currentSeason.id)
				)
				.where('registered', '==', false)
				.get()

			if (unregisteredTeamsSnapshot.size === 0) {
				return
			}

			logger.info(
				`Deleting ${unregisteredTeamsSnapshot.size} unregistered teams...`
			)

			const teamRefs = unregisteredTeamsSnapshot.docs.map(
				(doc) => doc.ref as FirebaseFirestore.DocumentReference<TeamDocument>
			)
			const results = await deleteUnregisteredTeamsForSeasonLock(
				firestore,
				teamRefs,
				currentSeason.id
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
		} catch (error) {
			logger.error('Error processing team registration lock:', {
				teamId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
		}
	}
)
