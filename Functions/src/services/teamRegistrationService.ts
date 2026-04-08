/**
 * Team registration status management service
 *
 * Updates the `teams/{teamId}/teamSeasons/{seasonId}.registered` flag based on
 * how many roster members are paid + signed for the season.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { TEAM_CONFIG } from '../config/constants.js'
import { playerSeasonRef, teamSeasonRef } from '../shared/database.js'

/**
 * Recompute the registration status of a team for a specific season.
 *
 * Reads the team's roster subcollection and each roster player's matching
 * season subdoc. Updates `registered` and `registeredDate` on the team's
 * season subdoc when the status flips.
 *
 * Uses individual reads (not a transaction) since the roster subcollection
 * contents and the player season subdocs are queried independently.
 */
export async function updateTeamRegistrationStatus(
	teamId: string,
	seasonId: string
): Promise<void> {
	const firestore = getFirestore()

	try {
		const teamSeasonDocRef = teamSeasonRef(firestore, teamId, seasonId)
		const teamSeasonSnap = await teamSeasonDocRef.get()
		if (!teamSeasonSnap.exists) {
			logger.warn(`Team season not found: teams/${teamId}/seasons/${seasonId}`)
			return
		}

		const teamSeasonData = teamSeasonSnap.data()

		const rosterSnap = await teamSeasonDocRef.collection('roster').get()
		let registeredCount = 0
		if (!rosterSnap.empty) {
			const playerSeasons = await Promise.all(
				rosterSnap.docs.map((rosterDoc) =>
					playerSeasonRef(firestore, rosterDoc.id, seasonId).get()
				)
			)
			registeredCount = playerSeasons.filter((snap) => {
				if (!snap.exists) return false
				const data = snap.data()
				return Boolean(data?.paid && data?.signed)
			}).length
		}

		const shouldBeRegistered =
			registeredCount >= TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION

		if (teamSeasonData?.registered !== shouldBeRegistered) {
			await teamSeasonDocRef.update({
				registered: shouldBeRegistered,
				registeredDate: shouldBeRegistered
					? FieldValue.serverTimestamp()
					: null,
			})

			logger.info('Updated team registration status', {
				teamId,
				seasonId,
				registered: shouldBeRegistered,
				registeredCount,
			})
		}
	} catch (error) {
		logger.error('Error updating team registration status:', {
			teamId,
			seasonId,
			error: error instanceof Error ? error.message : 'Unknown error',
		})
		throw error
	}
}
