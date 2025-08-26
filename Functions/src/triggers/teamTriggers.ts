/**
 * Team registration status management Firebase Functions
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { PlayerDocument, TeamDocument } from '@minneapolis-winter-league/shared'
import { FIREBASE_CONFIG, TEAM_CONFIG } from '../config/constants.js'
import {
	getCurrentSeason,
	countRegisteredPlayersOnTeam,
	handleFunctionError,
} from '../utils/helpers.js'

/**
 * When a player's payment/waiver status changes, update their team's registration status
 *
 * @see https://firebase.google.com/docs/functions/firestore-events#trigger_a_function_when_a_document_is_updated
 */
export const updateTeamRegistrationOnPlayerChange = onDocumentUpdated(
	{
		document: 'players/{playerId}',
		region: FIREBASE_CONFIG.REGION,
	},
	async (event) => {
		const playerId = event.params.playerId

		try {
			const beforeData = event.data?.before.data() as PlayerDocument
			const afterData = event.data?.after.data() as PlayerDocument

			if (!beforeData || !afterData) {
				return
			}

			const currentSeason = await getCurrentSeason()
			if (!currentSeason) {
				logger.warn('No current season found')
				return
			}

			// Find current season data for this player
			const beforeSeasonData = beforeData.seasons?.find(
				(season) => season.season.id === currentSeason.id
			)
			const afterSeasonData = afterData.seasons?.find(
				(season) => season.season.id === currentSeason.id
			)

			if (!beforeSeasonData || !afterSeasonData || !afterSeasonData.team) {
				return
			}

			// Check if payment or waiver status changed
			const paymentChanged = beforeSeasonData.paid !== afterSeasonData.paid
			const waiverChanged = beforeSeasonData.signed !== afterSeasonData.signed

			if (paymentChanged || waiverChanged) {
				await updateTeamRegistrationStatus(
					afterSeasonData.team,
					currentSeason.id
				)

				logger.info(`Updated team registration status after player change`, {
					playerId,
					teamId: afterSeasonData.team.id,
					paymentChanged,
					waiverChanged,
				})
			}
		} catch (error) {
			throw handleFunctionError(error, 'updateTeamRegistrationOnPlayerChange', {
				playerId,
			})
		}
	}
)

/**
 * When a team roster changes, update the team's registration status
 *
 * @see https://firebase.google.com/docs/functions/firestore-events#trigger_a_function_when_a_document_is_updated
 */
export const updateTeamRegistrationOnRosterChange = onDocumentUpdated(
	{
		document: 'teams/{teamId}',
		region: FIREBASE_CONFIG.REGION,
	},
	async (event) => {
		const teamId = event.params.teamId

		try {
			const beforeData = event.data?.before.data() as TeamDocument
			const afterData = event.data?.after.data() as TeamDocument
			const teamRef = event.data?.after.ref

			if (!beforeData || !afterData || !teamRef) {
				return
			}

			// Check if roster size changed
			const rosterSizeChanged =
				beforeData.roster.length !== afterData.roster.length

			if (rosterSizeChanged) {
				const currentSeason = await getCurrentSeason()
				if (!currentSeason) {
					logger.warn('No current season found')
					return
				}

				await updateTeamRegistrationStatus(teamRef, currentSeason.id)

				logger.info(`Updated team registration status after roster change`, {
					teamId,
					oldRosterSize: beforeData.roster.length,
					newRosterSize: afterData.roster.length,
				})
			}
		} catch (error) {
			throw handleFunctionError(error, 'updateTeamRegistrationOnRosterChange', {
				teamId,
			})
		}
	}
)

/**
 * When a team's registration status changes, update the registeredDate
 *
 * @see https://firebase.google.com/docs/functions/firestore-events#trigger_a_function_when_a_document_is_updated
 */
export const updateTeamRegistrationDate = onDocumentUpdated(
	{
		document: 'teams/{teamId}',
		region: FIREBASE_CONFIG.REGION,
	},
	async (event) => {
		const teamId = event.params.teamId

		try {
			const beforeData = event.data?.before.data() as TeamDocument
			const afterData = event.data?.after.data() as TeamDocument
			const teamRef = event.data?.after.ref

			if (!beforeData || !afterData || !teamRef) {
				return
			}

			// Check if registration status changed
			if (beforeData.registered !== afterData.registered) {
				await teamRef.update({
					registeredDate: FieldValue.serverTimestamp(),
				})

				logger.info(`Updated team registration date`, {
					teamId,
					registered: afterData.registered,
				})
			}
		} catch (error) {
			throw handleFunctionError(error, 'updateTeamRegistrationDate', { teamId })
		}
	}
)

/**
 * Helper function to update a team's registration status
 */
async function updateTeamRegistrationStatus(
	teamRef: any,
	seasonId: string
): Promise<void> {
	try {
		const teamDoc = await teamRef.get()
		if (!teamDoc.exists) {
			logger.warn(`Team document not found: ${teamRef.id}`)
			return
		}

		const teamData = teamDoc.data() as TeamDocument

		// Count registered players on the team
		const registeredCount = await countRegisteredPlayersOnTeam(
			teamData.roster,
			seasonId
		)

		// Determine if team should be registered
		const shouldBeRegistered =
			registeredCount >= TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION

		// Update registration status if it changed
		if (teamData.registered !== shouldBeRegistered) {
			await teamRef.update({
				registered: shouldBeRegistered,
			})

			logger.info(`Team registration status updated`, {
				teamId: teamRef.id,
				registeredPlayers: registeredCount,
				registered: shouldBeRegistered,
			})
		}
	} catch (error) {
		throw handleFunctionError(error, 'updateTeamRegistrationStatus', {
			teamId: teamRef.id,
			seasonId,
		})
	}
}
