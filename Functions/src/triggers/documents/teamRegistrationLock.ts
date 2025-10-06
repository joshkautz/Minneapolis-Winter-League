/**
 * Team registration lock trigger
 *
 * Triggers when a team's registration status changes. When 12 teams are fully
 * registered, all players NOT on registered teams are marked as "lookingForTeam".
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	TeamDocument,
	PlayerDocument,
	PlayerSeason,
} from '../../types.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { getCurrentSeason } from '../../shared/database.js'

const LOCK_THRESHOLD = 12 // Number of registered teams required to trigger lock

/**
 * Triggered when a team document is updated and registration status changes
 * Checks if 12 teams are now registered, and if so, marks players as looking for team
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

			// If we've reached the threshold, mark players as looking for team
			if (registeredTeamCount === LOCK_THRESHOLD) {
				logger.info(
					`${LOCK_THRESHOLD} teams registered! Marking players as looking for team...`
				)
				await lockPlayersForSeason(firestore, currentSeason.id, teamsSnapshot)
			}
		} catch (error) {
			logger.error('Error processing team registration lock:', {
				teamId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
		}
	}
)

/**
 * Mark players not on registered teams as looking for team
 */
async function lockPlayersForSeason(
	firestore: FirebaseFirestore.Firestore,
	seasonId: string,
	registeredTeamsSnapshot: FirebaseFirestore.QuerySnapshot
): Promise<void> {
	try {
		// Collect all player IDs on registered teams
		const playersOnRegisteredTeams = new Set<string>()

		for (const teamDoc of registeredTeamsSnapshot.docs) {
			const teamData = teamDoc.data() as TeamDocument
			for (const rosterEntry of teamData.roster || []) {
				playersOnRegisteredTeams.add(rosterEntry.player.id)
			}
		}

		logger.info(
			`Found ${playersOnRegisteredTeams.size} players on registered teams`
		)

		// Get all players with the current season in their seasons array
		const playersSnapshot = await firestore
			.collection(Collections.PLAYERS)
			.get()

		// Process players in batches
		const batchSize = 500 // Firestore batch limit
		let currentBatch = firestore.batch()
		let operationCount = 0

		for (const playerDoc of playersSnapshot.docs) {
			const playerData = playerDoc.data() as PlayerDocument
			const seasonIndex =
				playerData.seasons?.findIndex(
					(s: PlayerSeason) => s.season.id === seasonId
				) ?? -1

			if (seasonIndex === -1) {
				continue // Player not participating in this season
			}

			const currentSeasonData = playerData.seasons[seasonIndex]
			const isOnRegisteredTeam = playersOnRegisteredTeams.has(playerDoc.id)

			// Determine new status:
			// - false if player is on a registered team (regardless of individual registration)
			// - true if player is NOT on a registered team (includes unregistered teams and null teams)
			const newLookingForTeam = !isOnRegisteredTeam

			// Only update if status changed
			if (currentSeasonData.lookingForTeam !== newLookingForTeam) {
				const updatedSeasons = [...playerData.seasons]
				updatedSeasons[seasonIndex] = {
					...currentSeasonData,
					lookingForTeam: newLookingForTeam,
				}

				currentBatch.update(playerDoc.ref, { seasons: updatedSeasons })
				operationCount++ // Commit batch if we reach the limit
				if (operationCount >= batchSize) {
					await currentBatch.commit()
					logger.info(`Committed batch of ${operationCount} player updates`)
					currentBatch = firestore.batch()
					operationCount = 0
				}
			}
		}

		// Commit any remaining operations
		if (operationCount > 0) {
			await currentBatch.commit()
			logger.info(`Committed final batch of ${operationCount} player updates`)
		}

		logger.info(
			'Successfully updated player lookingForTeam status for season',
			{ seasonId }
		)
	} catch (error) {
		logger.error('Error updating players:', {
			seasonId,
			error: error instanceof Error ? error.message : 'Unknown error',
		})
		throw error
	}
}
