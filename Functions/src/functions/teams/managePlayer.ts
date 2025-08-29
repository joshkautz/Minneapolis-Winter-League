/**
 * Manage team player callable function
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections } from '@minneapolis-winter-league/shared'
import { validateAuthentication } from '../../shared/auth.js'
import { getCurrentSeason } from '../../shared/database.js'

interface ManagePlayerRequest {
	teamId: string
	playerId: string
	action: 'promote' | 'demote' | 'remove'
}

export const manageTeamPlayer = onCall<ManagePlayerRequest>(
	{ region: 'us-central1' },
	async (request) => {
		validateAuthentication(request.auth)

		const { teamId, playerId, action } = request.data
		const userId = request.auth!.uid

		if (!teamId || !playerId || !action) {
			throw new Error('Team ID, player ID, and action are required')
		}

		if (!['promote', 'demote', 'remove'].includes(action)) {
			throw new Error('Invalid action. Must be promote, demote, or remove')
		}

		try {
			const firestore = getFirestore()

			return await firestore.runTransaction(async (transaction) => {
				const currentSeason = await getCurrentSeason()
				if (!currentSeason) {
					throw new Error('No current season found')
				}

				// Get team and player documents
				const teamRef = firestore.collection(Collections.TEAMS).doc(teamId)
				const playerRef = firestore.collection(Collections.PLAYERS).doc(playerId)

				const [teamDoc, playerDoc] = await Promise.all([
					transaction.get(teamRef),
					transaction.get(playerRef),
				])

				if (!teamDoc.exists || !playerDoc.exists) {
					throw new Error('Team or player not found')
				}

				const teamDocument = teamDoc.data()
				const playerDocument = playerDoc.data()

				// Check if user is a captain of this team
				const userIsCaptain = teamDocument?.roster?.some(
					(member: any) => member.player.id === userId && member.captain
				)

				if (!userIsCaptain) {
					throw new Error('Only team captains can manage team players')
				}

				// Handle different actions
				switch (action) {
					case 'promote':
						return handlePromoteToCaptain(
							transaction,
							teamRef,
							teamDocument,
							playerRef,
							playerDocument
						)
					case 'demote':
						return handleDemoteFromCaptain(
							transaction,
							teamRef,
							teamDocument,
							playerRef,
							playerDocument
						)
					case 'remove':
						return handleRemoveFromTeam(
							transaction,
							teamRef,
							teamDocument,
							playerRef,
							playerDocument,
							playerId,
							currentSeason.id
						)
					default:
						throw new Error('Invalid action')
				}
			})
		} catch (error) {
			logger.error('Error managing team player:', {
				teamId,
				playerId,
				action,
				userId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new Error(
				error instanceof Error ? error.message : 'Failed to manage team player'
			)
		}
	}
)

// Helper functions for player management
function handlePromoteToCaptain(
	transaction: any,
	teamRef: any,
	teamDocument: any,
	playerRef: any,
	playerDocument: any
) {
	// Update team roster
	const updatedRoster = teamDocument.roster?.map((member: any) =>
		member.player.id === playerRef.id
			? { ...member, captain: true }
			: member
	) || []

	transaction.update(teamRef, { roster: updatedRoster })

	// Update player seasons
	const updatedSeasons = playerDocument.seasons?.map((season: any) =>
		season.team?.id === teamRef.id
			? { ...season, captain: true }
			: season
	) || []

	transaction.update(playerRef, { seasons: updatedSeasons })

	logger.info(`Promoted player to captain`, {
		teamId: teamRef.id,
		playerId: playerRef.id,
	})

	return { success: true, action: 'promoted', message: 'Player promoted to captain' }
}

function handleDemoteFromCaptain(
	transaction: any,
	teamRef: any,
	teamDocument: any,
	playerRef: any,
	playerDocument: any
) {
	// Check if this is the last captain
	const captainCount = teamDocument.roster?.filter((member: any) => member.captain).length || 0
	if (captainCount <= 1) {
		throw new Error('Cannot demote the last captain. Promote another player first.')
	}

	// Update team roster
	const updatedRoster = teamDocument.roster?.map((member: any) =>
		member.player.id === playerRef.id
			? { ...member, captain: false }
			: member
	) || []

	transaction.update(teamRef, { roster: updatedRoster })

	// Update player seasons
	const updatedSeasons = playerDocument.seasons?.map((season: any) =>
		season.team?.id === teamRef.id
			? { ...season, captain: false }
			: season
	) || []

	transaction.update(playerRef, { seasons: updatedSeasons })

	logger.info(`Demoted player from captain`, {
		teamId: teamRef.id,
		playerId: playerRef.id,
	})

	return { success: true, action: 'demoted', message: 'Player demoted from captain' }
}

function handleRemoveFromTeam(
	transaction: any,
	teamRef: any,
	teamDocument: any,
	playerRef: any,
	playerDocument: any,
	playerId: string,
	seasonId: string
) {
	// Check if this is the last captain
	const playerIsCaptain = teamDocument.roster?.find(
		(member: any) => member.player.id === playerId
	)?.captain

	const captainCount = teamDocument.roster?.filter((member: any) => member.captain).length || 0
	
	if (playerIsCaptain && captainCount <= 1) {
		throw new Error('Cannot remove the last captain. Promote another player first.')
	}

	// Remove player from team roster
	const updatedRoster = teamDocument.roster?.filter(
		(member: any) => member.player.id !== playerId
	) || []

	transaction.update(teamRef, { roster: updatedRoster })

	// Update player seasons
	const updatedSeasons = playerDocument.seasons?.map((season: any) =>
		season.season.id === seasonId
			? { ...season, team: null, captain: false }
			: season
	) || []

	transaction.update(playerRef, { seasons: updatedSeasons })

	logger.info(`Removed player from team`, {
		teamId: teamRef.id,
		playerId: playerRef.id,
	})

	return { success: true, action: 'removed', message: 'Player removed from team' }
}
