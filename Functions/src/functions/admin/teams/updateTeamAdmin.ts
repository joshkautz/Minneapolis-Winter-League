/**
 * Update team (admin) callable function
 *
 * This function allows admins to update any team's document, including:
 * - Team name
 * - Team ID (for linking team history across seasons)
 * - Roster management (add/remove players, change captain status)
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { validateAdminUser } from '../../../shared/auth.js'
import { cancelPendingOffersForPlayer } from '../../../shared/offers.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import {
	Collections,
	type DocumentReference,
	type PlayerDocument,
	type PlayerSeason,
	type SeasonDocument,
	type TeamDocument,
	type TeamRosterPlayer,
} from '../../../types.js'

/**
 * Player to add to roster
 */
interface AddPlayerRequest {
	/** Player's Firebase Auth UID */
	playerId: string
	/** Whether the player should be a captain */
	captain: boolean
}

/**
 * Captain status update request
 */
interface CaptainStatusUpdate {
	/** Player's Firebase Auth UID */
	playerId: string
	/** New captain status */
	captain: boolean
}

/**
 * Roster changes request
 */
interface RosterChanges {
	/** Players to add to roster */
	addPlayers?: AddPlayerRequest[]
	/** Player IDs to remove from roster */
	removePlayers?: string[]
	/** Players to update captain status */
	updateCaptainStatus?: CaptainStatusUpdate[]
}

/**
 * Request interface for updating a team document
 */
interface UpdateTeamAdminRequest {
	/** Team's Firestore document ID */
	teamDocId: string
	/** New team name (optional) */
	name?: string
	/** New teamId to link this team with another team's history (optional) */
	linkToTeamId?: string
	/** Roster changes (optional) */
	rosterChanges?: RosterChanges
}

/**
 * Response interface for successful team update
 */
interface UpdateTeamAdminResponse {
	success: true
	teamDocId: string
	message: string
	changes: {
		name?: { from: string; to: string }
		teamId?: { from: string; to: string }
		rosterAdded?: string[]
		rosterRemoved?: string[]
		captainChanges?: { playerId: string; from: boolean; to: boolean }[]
	}
}

/**
 * Updates a team's document with admin privileges
 *
 * Security validations:
 * - User must be authenticated with verified email
 * - User must have admin privileges (admin: true in player document)
 * - Target team must exist
 * - Target teamId must exist (if linking)
 * - Players must exist (if adding to roster)
 * - Players must not be on another team for the season (if adding)
 * - Cannot remove the last captain from a team
 */
export const updateTeamAdmin = onCall<
	UpdateTeamAdminRequest,
	Promise<UpdateTeamAdminResponse>
>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<UpdateTeamAdminResponse> => {
		const { auth, data } = request

		logger.info('updateTeamAdmin called', {
			adminUserId: auth?.uid,
			targetTeamDocId: data.teamDocId,
			hasNameUpdate: !!data.name,
			hasLinkUpdate: !!data.linkToTeamId,
			hasRosterChanges: !!data.rosterChanges,
		})

		// Validate admin authentication
		const firestore = getFirestore()
		await validateAdminUser(auth, firestore)

		const { teamDocId, name, linkToTeamId, rosterChanges } = data

		// Validate required fields
		if (!teamDocId) {
			throw new HttpsError('invalid-argument', 'Team document ID is required')
		}

		// Validate at least one field to update
		if (!name && !linkToTeamId && !rosterChanges) {
			throw new HttpsError(
				'invalid-argument',
				'At least one field to update is required'
			)
		}

		// Validate name if provided
		if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
			throw new HttpsError(
				'invalid-argument',
				'Team name must be a non-empty string'
			)
		}

		const teamRef = firestore
			.collection(Collections.TEAMS)
			.doc(teamDocId) as DocumentReference<TeamDocument>

		// Track changes for response
		const changes: UpdateTeamAdminResponse['changes'] = {}

		// Execute all updates in a transaction
		await firestore.runTransaction(async (transaction) => {
			// Get team document
			const teamDoc = await transaction.get(teamRef)

			if (!teamDoc.exists) {
				throw new HttpsError('not-found', 'Team not found')
			}

			const teamDocument = teamDoc.data()
			if (!teamDocument) {
				throw new HttpsError('internal', 'Unable to retrieve team data')
			}

			const seasonRef = teamDocument.season
			const seasonId = seasonRef.id

			// Prepare team updates
			const teamUpdates: Partial<TeamDocument> = {}

			// Handle name update
			if (name && name.trim() !== teamDocument.name) {
				const trimmedName = name.trim()
				changes.name = { from: teamDocument.name, to: trimmedName }
				teamUpdates.name = trimmedName
				logger.info('Updating team name', {
					teamDocId,
					from: teamDocument.name,
					to: trimmedName,
				})
			}

			// Handle team linking (teamId update)
			if (linkToTeamId && linkToTeamId !== teamDocument.teamId) {
				// Verify target teamId exists
				const teamsWithTargetId = await firestore
					.collection(Collections.TEAMS)
					.where('teamId', '==', linkToTeamId)
					.limit(1)
					.get()

				if (teamsWithTargetId.empty) {
					throw new HttpsError(
						'not-found',
						`No team found with teamId: ${linkToTeamId}`
					)
				}

				changes.teamId = { from: teamDocument.teamId, to: linkToTeamId }
				teamUpdates.teamId = linkToTeamId
				logger.info('Linking team to new teamId', {
					teamDocId,
					from: teamDocument.teamId,
					to: linkToTeamId,
				})
			}

			// Handle roster changes
			if (rosterChanges) {
				let currentRoster = [...(teamDocument.roster || [])]

				// Handle adding players
				if (rosterChanges.addPlayers && rosterChanges.addPlayers.length > 0) {
					changes.rosterAdded = []

					for (const addRequest of rosterChanges.addPlayers) {
						const { playerId, captain } = addRequest

						// Get player document
						const playerRef = firestore
							.collection(Collections.PLAYERS)
							.doc(playerId) as DocumentReference<PlayerDocument>
						const playerDoc = await transaction.get(playerRef)

						if (!playerDoc.exists) {
							throw new HttpsError('not-found', `Player not found: ${playerId}`)
						}

						const playerDocument = playerDoc.data()
						if (!playerDocument) {
							throw new HttpsError(
								'internal',
								`Unable to retrieve player data: ${playerId}`
							)
						}

						// Check if player is already on this team
						const alreadyOnTeam = currentRoster.some(
							(member) => member.player.id === playerId
						)
						if (alreadyOnTeam) {
							throw new HttpsError(
								'already-exists',
								`Player ${playerId} is already on this team`
							)
						}

						// Check if player is on another team for this season
						const playerSeasonData = playerDocument.seasons?.find(
							(s: PlayerSeason) => s.season.id === seasonId
						)
						if (
							playerSeasonData?.team &&
							playerSeasonData.team.id !== teamDocId
						) {
							throw new HttpsError(
								'failed-precondition',
								`Player ${playerId} is already on another team for this season`
							)
						}

						// Add player to roster
						const newRosterMember: TeamRosterPlayer = {
							player: playerRef,
							captain,
							dateJoined: Timestamp.now(),
						}
						currentRoster.push(newRosterMember)

						// Update player's season data
						let updatedSeasons = playerDocument.seasons || []
						const existingSeasonIndex = updatedSeasons.findIndex(
							(s: PlayerSeason) => s.season.id === seasonId
						)

						if (existingSeasonIndex >= 0) {
							// Update existing season entry
							updatedSeasons[existingSeasonIndex] = {
								...updatedSeasons[existingSeasonIndex],
								team: teamRef,
								captain,
							}
						} else {
							// Create new season entry for this player
							const newSeasonEntry: PlayerSeason = {
								season: seasonRef as DocumentReference<SeasonDocument>,
								team: teamRef,
								captain,
								paid: false,
								signed: false,
								banned: false,
								lookingForTeam: false,
							}
							updatedSeasons = [...updatedSeasons, newSeasonEntry]
						}

						transaction.update(playerRef, { seasons: updatedSeasons })

						// Cancel pending offers for this player
						// Note: We need to do this outside the transaction since it's a separate query
						changes.rosterAdded.push(playerId)

						logger.info('Added player to team roster', {
							teamDocId,
							playerId,
							captain,
							seasonId,
						})
					}
				}

				// Handle removing players
				if (
					rosterChanges.removePlayers &&
					rosterChanges.removePlayers.length > 0
				) {
					changes.rosterRemoved = []

					for (const playerId of rosterChanges.removePlayers) {
						// Find player in roster
						const rosterIndex = currentRoster.findIndex(
							(member) => member.player.id === playerId
						)

						if (rosterIndex === -1) {
							throw new HttpsError(
								'not-found',
								`Player ${playerId} is not on this team's roster`
							)
						}

						const memberToRemove = currentRoster[rosterIndex]

						// Check if removing last captain
						if (memberToRemove.captain) {
							const otherCaptains = currentRoster.filter(
								(member) => member.captain && member.player.id !== playerId
							)
							if (otherCaptains.length === 0) {
								throw new HttpsError(
									'failed-precondition',
									`Cannot remove ${playerId}: they are the only captain. Promote another player first.`
								)
							}
						}

						// Remove from roster
						currentRoster.splice(rosterIndex, 1)

						// Update player's season data
						const playerRef = firestore
							.collection(Collections.PLAYERS)
							.doc(playerId) as DocumentReference<PlayerDocument>
						const playerDoc = await transaction.get(playerRef)

						if (playerDoc.exists) {
							const playerDocument = playerDoc.data()
							if (playerDocument) {
								const updatedSeasons =
									playerDocument.seasons?.map((s: PlayerSeason) =>
										s.season.id === seasonId
											? { ...s, team: null, captain: false }
											: s
									) || []
								transaction.update(playerRef, { seasons: updatedSeasons })
							}
						}

						changes.rosterRemoved.push(playerId)

						logger.info('Removed player from team roster', {
							teamDocId,
							playerId,
							seasonId,
						})
					}
				}

				// Handle captain status updates
				if (
					rosterChanges.updateCaptainStatus &&
					rosterChanges.updateCaptainStatus.length > 0
				) {
					changes.captainChanges = []

					for (const statusUpdate of rosterChanges.updateCaptainStatus) {
						const { playerId, captain } = statusUpdate

						// Find player in roster
						const rosterIndex = currentRoster.findIndex(
							(member) => member.player.id === playerId
						)

						if (rosterIndex === -1) {
							throw new HttpsError(
								'not-found',
								`Player ${playerId} is not on this team's roster`
							)
						}

						const currentMember = currentRoster[rosterIndex]
						const currentCaptainStatus = currentMember.captain

						// Skip if no change
						if (currentCaptainStatus === captain) {
							continue
						}

						// Check if demoting last captain
						if (currentCaptainStatus && !captain) {
							const otherCaptains = currentRoster.filter(
								(member) => member.captain && member.player.id !== playerId
							)
							if (otherCaptains.length === 0) {
								throw new HttpsError(
									'failed-precondition',
									`Cannot demote ${playerId}: they are the only captain. Promote another player first.`
								)
							}
						}

						// Update roster
						currentRoster[rosterIndex] = {
							...currentMember,
							captain,
						}

						// Update player's season data
						const playerRef = firestore
							.collection(Collections.PLAYERS)
							.doc(playerId) as DocumentReference<PlayerDocument>
						const playerDoc = await transaction.get(playerRef)

						if (playerDoc.exists) {
							const playerDocument = playerDoc.data()
							if (playerDocument) {
								const updatedSeasons =
									playerDocument.seasons?.map((s: PlayerSeason) =>
										s.season.id === seasonId ? { ...s, captain } : s
									) || []
								transaction.update(playerRef, { seasons: updatedSeasons })
							}
						}

						changes.captainChanges.push({
							playerId,
							from: currentCaptainStatus,
							to: captain,
						})

						logger.info('Updated player captain status', {
							teamDocId,
							playerId,
							from: currentCaptainStatus,
							to: captain,
							seasonId,
						})
					}
				}

				// Update team roster
				teamUpdates.roster = currentRoster
			}

			// Apply team updates
			if (Object.keys(teamUpdates).length > 0) {
				transaction.update(teamRef, teamUpdates)
			}
		})

		// Cancel pending offers for added players (outside transaction)
		if (rosterChanges?.addPlayers && changes.rosterAdded) {
			const teamDoc = await teamRef.get()
			const seasonRef = teamDoc.data()?.season
			if (seasonRef) {
				for (const playerId of changes.rosterAdded) {
					const playerRef = firestore
						.collection(Collections.PLAYERS)
						.doc(playerId) as DocumentReference<PlayerDocument>
					try {
						await cancelPendingOffersForPlayer(
							firestore,
							playerRef,
							seasonRef as DocumentReference<SeasonDocument>,
							'Player was added to a team by an administrator'
						)
					} catch (error) {
						logger.warn('Failed to cancel pending offers for player', {
							playerId,
							error: error instanceof Error ? error.message : 'Unknown error',
						})
					}
				}
			}
		}

		logger.info('Successfully updated team', {
			teamDocId,
			adminUserId: auth?.uid,
			changes,
		})

		return {
			success: true,
			teamDocId,
			message: 'Team updated successfully',
			changes,
		}
	}
)
