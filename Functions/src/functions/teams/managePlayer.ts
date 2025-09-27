/**
 * Manage team player callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	TeamDocument,
	PlayerDocument,
	TeamRosterPlayer,
	PlayerSeason,
} from '../../types.js'
import { validateAuthentication } from '../../shared/auth.js'
import { getCurrentSeason } from '../../shared/database.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'

interface ManagePlayerRequest {
	teamId: string
	playerId: string
	action: 'promote' | 'demote' | 'remove'
}

export const manageTeamPlayer = onCall<ManagePlayerRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		validateAuthentication(request.auth)

		const { teamId, playerId, action } = request.data
		const userId = request.auth!.uid

		if (!teamId || !playerId || !action) {
			throw new HttpsError(
				'invalid-argument',
				'Team ID, player ID, and action are required'
			)
		}

		if (!['promote', 'demote', 'remove'].includes(action)) {
			throw new HttpsError(
				'invalid-argument',
				'Invalid action. Must be promote, demote, or remove'
			)
		}

		try {
			const firestore = getFirestore()

			return await firestore.runTransaction(async (transaction) => {
				const currentSeason = await getCurrentSeason()
				if (!currentSeason) {
					throw new HttpsError('not-found', 'No current season found')
				}

				// Get team and player documents
				const teamRef = firestore.collection(Collections.TEAMS).doc(teamId)
				const playerRef = firestore
					.collection(Collections.PLAYERS)
					.doc(playerId)

				const [teamDoc, playerDoc] = await Promise.all([
					transaction.get(teamRef),
					transaction.get(playerRef),
				])

				if (!teamDoc.exists || !playerDoc.exists) {
					throw new HttpsError('not-found', 'Team or player not found')
				}

				const teamDocument = teamDoc.data() as TeamDocument
				const playerDocument = playerDoc.data() as PlayerDocument

				// Check if user is a captain of this team
				const userIsCaptain = teamDocument?.roster?.some(
					(member: TeamRosterPlayer) =>
						member.player.id === userId && member.captain
				)

				// Authorization check: captains can manage any player,
				// any player can remove themselves
				const canPerformAction =
					userIsCaptain || (action === 'remove' && playerId === userId)

				if (!canPerformAction) {
					if (action === 'remove') {
						throw new HttpsError(
							'permission-denied',
							'You can only remove yourself from the team'
						)
					} else {
						throw new HttpsError(
							'permission-denied',
							'Only team captains can manage team players'
						)
					}
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
						throw new HttpsError('invalid-argument', 'Invalid action')
				}
			})
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error managing team player:', {
				teamId,
				playerId,
				action,
				userId,
				error: errorMessage,
			})

			// Use HttpsError to properly return error messages to client
			throw new HttpsError('failed-precondition', errorMessage)
		}
	}
)

// Helper functions for player management
function handlePromoteToCaptain(
	transaction: FirebaseFirestore.Transaction,
	teamRef: FirebaseFirestore.DocumentReference,
	teamDocument: TeamDocument,
	playerRef: FirebaseFirestore.DocumentReference,
	playerDocument: PlayerDocument
): { success: boolean; action: string; message: string } {
	// Update team roster
	const updatedRoster =
		teamDocument.roster?.map((member: TeamRosterPlayer) =>
			member.player.id === playerRef.id ? { ...member, captain: true } : member
		) || []

	transaction.update(teamRef, { roster: updatedRoster })

	// Update player seasons
	const updatedSeasons =
		playerDocument.seasons?.map((season: PlayerSeason) =>
			season.team?.id === teamRef.id ? { ...season, captain: true } : season
		) || []

	transaction.update(playerRef, { seasons: updatedSeasons })

	logger.info(`Promoted player to captain`, {
		teamId: teamRef.id,
		playerId: playerRef.id,
	})

	return {
		success: true,
		action: 'promoted',
		message: 'Player promoted to captain',
	}
}

function handleDemoteFromCaptain(
	transaction: FirebaseFirestore.Transaction,
	teamRef: FirebaseFirestore.DocumentReference,
	teamDocument: TeamDocument,
	playerRef: FirebaseFirestore.DocumentReference,
	playerDocument: PlayerDocument
): { success: boolean; action: string; message: string } {
	// Check if this is the last captain
	const captainCount =
		teamDocument.roster?.filter((member: TeamRosterPlayer) => member.captain)
			.length || 0
	if (captainCount <= 1) {
		throw new HttpsError(
			'failed-precondition',
			'Cannot demote the last captain. You must promote another player to captain first.'
		)
	}

	// Update team roster
	const updatedRoster =
		teamDocument.roster?.map((member: TeamRosterPlayer) =>
			member.player.id === playerRef.id ? { ...member, captain: false } : member
		) || []

	transaction.update(teamRef, { roster: updatedRoster })

	// Update player seasons
	const updatedSeasons =
		playerDocument.seasons?.map((season: PlayerSeason) =>
			season.team?.id === teamRef.id ? { ...season, captain: false } : season
		) || []

	transaction.update(playerRef, { seasons: updatedSeasons })

	logger.info(`Demoted player from captain`, {
		teamId: teamRef.id,
		playerId: playerRef.id,
	})

	return {
		success: true,
		action: 'demoted',
		message: 'Player demoted from captain',
	}
}

function handleRemoveFromTeam(
	transaction: FirebaseFirestore.Transaction,
	teamRef: FirebaseFirestore.DocumentReference,
	teamDocument: TeamDocument,
	playerRef: FirebaseFirestore.DocumentReference,
	playerDocument: PlayerDocument,
	playerId: string,
	seasonId: string
): { success: boolean; action: string; message: string } {
	// Check if this is the last captain
	const playerIsCaptain = teamDocument.roster?.find(
		(member: TeamRosterPlayer) => member.player.id === playerId
	)?.captain

	const captainCount =
		teamDocument.roster?.filter((member: TeamRosterPlayer) => member.captain)
			.length || 0

	if (playerIsCaptain && captainCount <= 1) {
		throw new HttpsError(
			'failed-precondition',
			'Cannot remove the last captain. You must promote another player to captain before leaving the team.'
		)
	}

	// Remove player from team roster
	const updatedRoster =
		teamDocument.roster?.filter(
			(member: TeamRosterPlayer) => member.player.id !== playerId
		) || []

	transaction.update(teamRef, { roster: updatedRoster })

	// Update player seasons
	const updatedSeasons =
		playerDocument.seasons?.map((season: PlayerSeason) =>
			season.season.id === seasonId
				? { ...season, team: null, captain: false }
				: season
		) || []

	transaction.update(playerRef, { seasons: updatedSeasons })

	logger.info(`Removed player from team`, {
		teamId: teamRef.id,
		playerId: playerRef.id,
	})

	return {
		success: true,
		action: 'removed',
		message: 'Player removed from team',
	}
}
