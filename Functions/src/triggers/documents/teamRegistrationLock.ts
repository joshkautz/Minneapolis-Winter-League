/**
 * Team registration lock trigger
 *
 * Fires when a team's per-season registration flag flips from false → true.
 * When the threshold (12 registered teams) is reached, deletes every other
 * unregistered team-season participation for the current season.
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

const LOCK_THRESHOLD = TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK

export const onTeamRegistrationChange = onDocumentUpdated(
	{
		document: 'teams/{teamId}/teamSeasons/{seasonId}',
		region: FIREBASE_CONFIG.REGION,
	},
	async (event) => {
		const beforeData = event.data?.before.data() as
			| TeamSeasonDocument
			| undefined
		const afterData = event.data?.after.data() as TeamSeasonDocument | undefined

		// Only process when registration flips from false → true.
		if (beforeData?.registered !== false || afterData?.registered !== true) {
			return
		}

		const { teamId, seasonId } = event.params
		logger.info(`Team became registered: ${teamId}/${seasonId}`)

		try {
			const firestore = getFirestore()
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

			logger.info(`Deleting ${pairs.length} unregistered team-seasons...`)

			const results = await deleteUnregisteredTeamsForSeasonLock(
				firestore,
				pairs
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
				seasonId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
		}
	}
)
