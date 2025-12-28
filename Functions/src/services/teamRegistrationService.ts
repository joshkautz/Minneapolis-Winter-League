/**
 * Team registration status management service
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { TeamDocument, PlayerDocument, PlayerSeason } from '../types.js'
import { TEAM_CONFIG } from '../config/constants.js'

/**
 * Helper function to update a team's registration status atomically
 * Uses a transaction to ensure consistent read of team and player data
 */
export async function updateTeamRegistrationStatus(
	teamRef: FirebaseFirestore.DocumentReference,
	seasonId: string
): Promise<void> {
	const firestore = getFirestore()

	try {
		// Use transaction to atomically read team, count players, and update
		await firestore.runTransaction(async (transaction) => {
			const teamDoc = await transaction.get(teamRef)
			if (!teamDoc.exists) {
				logger.warn(`Team document not found: ${teamRef.id}`)
				return
			}

			const teamDocument = teamDoc.data() as TeamDocument

			// Count registered players on the team (within transaction)
			let registeredCount = 0
			if (teamDocument.roster && teamDocument.roster.length > 0) {
				const playerDocs = await Promise.all(
					teamDocument.roster.map((member) => transaction.get(member.player))
				)

				registeredCount = playerDocs.filter((playerDoc) => {
					if (!playerDoc.exists) return false
					const playerData = playerDoc.data() as PlayerDocument
					const seasonData = playerData.seasons?.find(
						(season: PlayerSeason) => season.season.id === seasonId
					)
					return Boolean(seasonData?.paid && seasonData?.signed)
				}).length
			}

			// Determine if team should be registered
			const shouldBeRegistered =
				registeredCount >= TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION

			// Update registration status if it changed
			if (teamDocument.registered !== shouldBeRegistered) {
				transaction.update(teamRef, {
					registered: shouldBeRegistered,
					registeredDate: Timestamp.now(),
				})

				logger.info(`Updated team registration status`, {
					teamId: teamRef.id,
					registered: shouldBeRegistered,
					playerCount: registeredCount,
				})
			}
		})
	} catch (error) {
		logger.error('Error updating team registration status:', {
			teamId: teamRef.id,
			error: error instanceof Error ? error.message : 'Unknown error',
		})
		throw error
	}
}
