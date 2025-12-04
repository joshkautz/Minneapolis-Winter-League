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
	SeasonDocument,
	DocumentReference,
	KarmaTransaction,
} from '../../../types.js'
import { validateAuthentication } from '../../../shared/auth.js'
import { getCurrentSeason } from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import {
	findKarmaTransactionForPlayerJoin,
	createKarmaTransaction,
	KARMA_AMOUNT,
} from '../../../shared/karma.js'

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
		const userId = request.auth?.uid ?? ''

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

				// Get season document to check dates
				const seasonRef = firestore
					.collection(Collections.SEASONS)
					.doc(currentSeason.id)
				const seasonDoc = await transaction.get(seasonRef)

				if (!seasonDoc.exists) {
					throw new HttpsError('not-found', 'Season not found')
				}

				const seasonData = seasonDoc.data() as SeasonDocument

				// Check if user is an admin
				const currentUserRef = firestore
					.collection(Collections.PLAYERS)
					.doc(userId)
				const currentUserDoc = await transaction.get(currentUserRef)
				const isAdmin = currentUserDoc.data()?.admin === true

				// Validate that season has not started yet (skip for admins)
				if (!isAdmin) {
					const now = new Date()
					const seasonStart = seasonData.dateStart.toDate()

					if (now >= seasonStart) {
						const formatDate = (date: Date): string => {
							const options: Intl.DateTimeFormatOptions = {
								year: 'numeric',
								month: 'long',
								day: 'numeric',
								hour: 'numeric',
								minute: '2-digit',
								timeZoneName: 'short',
							}
							return date.toLocaleDateString('en-US', options)
						}
						throw new HttpsError(
							'failed-precondition',
							`Team roster changes are not allowed after the season has started. The season started on ${formatDate(seasonStart)}.`
						)
					}
				}

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
					case 'remove': {
						// For remove action, we need to check all roster players' registration status
						// Fetch all player documents in the transaction
						const rosterPlayerDocs = await Promise.all(
							teamDocument.roster.map((member) =>
								transaction.get(member.player)
							)
						)

						// Check if team was awarded karma when this player joined
						const seasonRef = firestore
							.collection(Collections.SEASONS)
							.doc(currentSeason.id) as DocumentReference<SeasonDocument>

						const karmaTransaction = await findKarmaTransactionForPlayerJoin(
							teamRef as DocumentReference<TeamDocument>,
							playerRef as DocumentReference<PlayerDocument>,
							seasonRef
						)

						return handleRemoveFromTeam(
							transaction,
							teamRef,
							teamDocument,
							playerRef,
							playerDocument,
							playerId,
							currentSeason.id,
							rosterPlayerDocs,
							seasonRef,
							karmaTransaction
						)
					}
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
	seasonId: string,
	rosterPlayerDocs: FirebaseFirestore.DocumentSnapshot[],
	seasonRef: FirebaseFirestore.DocumentReference<SeasonDocument>,
	karmaTransactionFound: KarmaTransaction | null
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

	// Check if removing this player would cause team to lose registered status
	if (teamDocument.registered) {
		const minPlayersRequired = 10 // MIN_PLAYERS_FOR_REGISTRATION constant

		// Count how many players on the team are actually registered (paid + signed)
		// excluding the player who is leaving
		const registeredPlayerCount = rosterPlayerDocs.filter((doc, index) => {
			const member = teamDocument.roster[index]

			// Don't count the player who is leaving
			if (member.player.id === playerId) {
				return false
			}

			// Check if this player is registered for the current season
			const playerData = doc.data() as PlayerDocument
			const seasonData = playerData.seasons?.find(
				(s: PlayerSeason) => s.season.id === seasonId
			)

			return Boolean(seasonData?.paid && seasonData?.signed)
		}).length

		if (registeredPlayerCount < minPlayersRequired) {
			throw new HttpsError(
				'failed-precondition',
				`You cannot leave your team at this time. Your departure would cause the team to lose its registered status. The team needs at least ${minPlayersRequired} fully registered players (paid and signed waiver), but would only have ${registeredPlayerCount} after your departure.`
			)
		}
	}

	const currentKarma = teamDocument.karma || 0

	// Remove player from team roster
	const updatedRoster =
		teamDocument.roster?.filter(
			(member: TeamRosterPlayer) => member.player.id !== playerId
		) || []

	// Update team with new roster and adjusted karma
	const teamUpdates: Partial<TeamDocument> = {
		roster: updatedRoster,
	}

	// Only subtract karma if the team was awarded karma when this player joined
	let karmaAdjustment = 0
	if (karmaTransactionFound) {
		karmaAdjustment = -KARMA_AMOUNT
		teamUpdates.karma = Math.max(0, currentKarma + karmaAdjustment)

		// Create a transaction record for the karma removal
		createKarmaTransaction(
			transaction,
			teamRef as DocumentReference<TeamDocument>,
			playerRef as DocumentReference<PlayerDocument>,
			seasonRef,
			karmaAdjustment,
			'player_left'
		)
	}

	transaction.update(teamRef, teamUpdates)

	// Update player seasons
	// Note: lookingForTeam status is permanent once set, so we preserve it
	const updatedSeasons =
		playerDocument.seasons?.map((season: PlayerSeason) =>
			season.season.id === seasonId
				? {
						...season,
						team: null,
						captain: false,
						// Don't modify lookingForTeam - it's permanent once set
					}
				: season
		) || []

	transaction.update(playerRef, { seasons: updatedSeasons })

	logger.info(`Removed player from team`, {
		teamId: teamRef.id,
		playerId: playerRef.id,
		karmaAdjustment,
		hadKarmaTransaction: !!karmaTransactionFound,
	})

	return {
		success: true,
		action: 'removed',
		message: 'Player removed from team',
	}
}
