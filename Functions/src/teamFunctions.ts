/**
 * Team Management Firebase Functions
 *
 * These functions handle complex team operations that require:
 * - Multi-document transactions
 * - Complex business logic validation
 * - Atomic updates across collections
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue, Transaction } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { v4 as uuidv4 } from 'uuid'

const firestore = getFirestore()

//////////////////////////////////////////////////////////////////////////////
// TEAM CREATION
//////////////////////////////////////////////////////////////////////////////

interface CreateTeamRequest {
	name: string
	logo?: string
	seasonId: string
	storagePath?: string
}

export const createTeam = onCall<CreateTeamRequest>(
	{ region: 'us-central1' },
	async (request) => {
		// Validate authentication
		if (!request.auth) {
			throw new Error('Authentication required')
		}

		if (!request.auth.token.email_verified) {
			throw new Error('Email verification required')
		}

		const { name, logo, seasonId, storagePath } = request.data
		const userId = request.auth.uid

		if (!name || !seasonId) {
			throw new Error('Team name and season are required')
		}

		try {
			return await firestore.runTransaction(async (transaction) => {
				// Get player document
				const playerRef = firestore.collection('players').doc(userId)
				const playerDoc = await transaction.get(playerRef)

				if (!playerDoc.exists) {
					throw new Error('Player not found')
				}

				const playerData = playerDoc.data()!

				// Get season document
				const seasonRef = firestore.collection('seasons').doc(seasonId)
				const seasonDoc = await transaction.get(seasonRef)

				if (!seasonDoc.exists) {
					throw new Error('Season not found')
				}

				// Validate player isn't already on a team for this season
				const existingTeamForSeason = playerData.seasons?.find(
					(s: any) => s.season.id === seasonId && s.team !== null
				)

				if (existingTeamForSeason) {
					throw new Error('Player is already on a team for this season')
				}

				// Create team document
				const teamRef = firestore.collection('teams').doc()
				const teamData = {
					name,
					logo: logo || null,
					placement: null,
					registered: false,
					registeredDate: FieldValue.serverTimestamp(),
					roster: [{ captain: true, player: playerRef }],
					season: seasonRef,
					storagePath: storagePath || null,
					teamId: uuidv4(),
					createdAt: FieldValue.serverTimestamp(),
				}

				transaction.set(teamRef, teamData)

				// Update player document
				const updatedSeasons =
					playerData.seasons?.map((season: any) => {
						if (season.season.id === seasonId) {
							return {
								...season,
								captain: true,
								team: teamRef,
							}
						}
						return season
					}) || []

				transaction.update(playerRef, { seasons: updatedSeasons })

				// Update season document
				const seasonData = seasonDoc.data()!
				const updatedTeams = [...(seasonData.teams || []), teamRef]
				transaction.update(seasonRef, { teams: updatedTeams })

				logger.info(`Team created: ${teamRef.id}`, {
					teamName: name,
					captain: userId,
					season: seasonId,
				})

				return { teamId: teamRef.id, success: true }
			})
		} catch (error) {
			logger.error('Error creating team:', error)
			throw new Error(
				error instanceof Error ? error.message : 'Failed to create team'
			)
		}
	}
)

//////////////////////////////////////////////////////////////////////////////
// TEAM DELETION
//////////////////////////////////////////////////////////////////////////////

interface DeleteTeamRequest {
	teamId: string
}

export const deleteTeam = onCall<DeleteTeamRequest>(
	{ region: 'us-central1' },
	async (request) => {
		if (!request.auth?.token.email_verified) {
			throw new Error('Authentication and email verification required')
		}

		const { teamId } = request.data
		const userId = request.auth.uid

		if (!teamId) {
			throw new Error('Team ID is required')
		}

		try {
			return await firestore.runTransaction(async (transaction) => {
				// Get team document
				const teamRef = firestore.collection('teams').doc(teamId)
				const teamDoc = await transaction.get(teamRef)

				if (!teamDoc.exists) {
					throw new Error('Team not found')
				}

				const teamData = teamDoc.data()!

				// Verify user is captain of this team
				const isCaptain = teamData.roster?.some(
					(member: any) => member.captain && member.player.id === userId
				)

				if (!isCaptain) {
					throw new Error('Only team captains can delete teams')
				}

				// Delete all offers related to this team
				const offersQuery = await firestore
					.collection('offers')
					.where('team', '==', teamRef)
					.get()

				offersQuery.docs.forEach((offerDoc) => {
					transaction.delete(offerDoc.ref)
				})

				// Update all players on this team - need to get docs outside transaction
				const playerUpdates: Array<{ ref: any; data: any }> = []

				for (const member of teamData.roster || []) {
					const playerRef = member.player
					const playerSnapshot = await playerRef.get()

					if (playerSnapshot.exists) {
						const playerData = playerSnapshot.data()!
						const updatedSeasons =
							playerData.seasons?.map((season: any) => {
								if (season.team?.id === teamId) {
									return {
										...season,
										captain: false,
										team: null,
									}
								}
								return season
							}) || []

						playerUpdates.push({
							ref: playerRef,
							data: { seasons: updatedSeasons },
						})
					}
				}

				// Apply player updates in transaction
				playerUpdates.forEach((update) => {
					transaction.update(update.ref, update.data)
				})

				// Update season document
				const seasonRef = teamData.season
				if (seasonRef) {
					const seasonSnapshot = await seasonRef.get()
					if (seasonSnapshot.exists) {
						const seasonData = seasonSnapshot.data()!
						const updatedTeams = (seasonData.teams || []).filter(
							(team: any) => team.id !== teamId
						)
						transaction.update(seasonRef, { teams: updatedTeams })
					}
				}

				// Delete the team document
				transaction.delete(teamRef)

				logger.info(`Team deleted: ${teamId}`, {
					deletedBy: userId,
					teamName: teamData.name,
				})

				return { success: true }
			})
		} catch (error) {
			logger.error('Error deleting team:', error)
			throw new Error(
				error instanceof Error ? error.message : 'Failed to delete team'
			)
		}
	}
)

//////////////////////////////////////////////////////////////////////////////
// PLAYER ROSTER MANAGEMENT
//////////////////////////////////////////////////////////////////////////////

interface ManagePlayerRequest {
	teamId: string
	playerId: string
	action: 'promote' | 'demote' | 'remove'
}

export const manageTeamPlayer = onCall<ManagePlayerRequest>(
	{ region: 'us-central1' },
	async (request) => {
		if (!request.auth?.token.email_verified) {
			throw new Error('Authentication and email verification required')
		}

		const { teamId, playerId, action } = request.data
		const userId = request.auth.uid

		if (!teamId || !playerId || !action) {
			throw new Error('Team ID, player ID, and action are required')
		}

		try {
			return await firestore.runTransaction(async (transaction) => {
				// Get team and verify captain status
				const teamRef = firestore.collection('teams').doc(teamId)
				const teamDoc = await transaction.get(teamRef)

				if (!teamDoc.exists) {
					throw new Error('Team not found')
				}

				const teamData = teamDoc.data()!
				const userIsCaptain = teamData.roster?.some(
					(member: any) => member.captain && member.player.id === userId
				)

				if (!userIsCaptain) {
					throw new Error('Only team captains can manage players')
				}

				// Get player document
				const playerRef = firestore.collection('players').doc(playerId)
				const playerDoc = await transaction.get(playerRef)

				if (!playerDoc.exists) {
					throw new Error('Player not found')
				}

				const playerData = playerDoc.data()!

				// Perform the requested action
				switch (action) {
					case 'promote':
						return handlePromoteToCaptain(
							transaction,
							teamRef,
							teamData,
							playerRef,
							playerData
						)

					case 'demote':
						return handleDemoteFromCaptain(
							transaction,
							teamRef,
							teamData,
							playerRef,
							playerData
						)

					case 'remove':
						return handleRemoveFromTeam(
							transaction,
							teamRef,
							teamData,
							playerRef,
							playerData,
							playerId
						)

					default:
						throw new Error('Invalid action')
				}
			})
		} catch (error) {
			logger.error('Error managing team player:', error)
			throw new Error(
				error instanceof Error ? error.message : 'Failed to manage player'
			)
		}
	}
)

// Helper functions for player management
function handlePromoteToCaptain(
	transaction: any,
	teamRef: any,
	teamData: any,
	playerRef: any,
	playerData: any
) {
	// Update team roster
	const updatedRoster =
		teamData.roster?.map((member: any) => {
			if (member.player.id === playerRef.id) {
				return { ...member, captain: true }
			}
			return member
		}) || []

	transaction.update(teamRef, { roster: updatedRoster })

	// Update player seasons
	const updatedSeasons =
		playerData.seasons?.map((season: any) => {
			if (season.team?.id === teamRef.id) {
				return { ...season, captain: true }
			}
			return season
		}) || []

	transaction.update(playerRef, { seasons: updatedSeasons })

	return { success: true, action: 'promoted' }
}

function handleDemoteFromCaptain(
	transaction: any,
	teamRef: any,
	teamData: any,
	playerRef: any,
	playerData: any
) {
	// Check if this is the last captain
	const captainCount =
		teamData.roster?.filter((member: any) => member.captain).length || 0
	if (captainCount <= 1) {
		throw new Error('Cannot demote the last captain')
	}

	// Update team roster
	const updatedRoster =
		teamData.roster?.map((member: any) => {
			if (member.player.id === playerRef.id) {
				return { ...member, captain: false }
			}
			return member
		}) || []

	transaction.update(teamRef, { roster: updatedRoster })

	// Update player seasons
	const updatedSeasons =
		playerData.seasons?.map((season: any) => {
			if (season.team?.id === teamRef.id) {
				return { ...season, captain: false }
			}
			return season
		}) || []

	transaction.update(playerRef, { seasons: updatedSeasons })

	return { success: true, action: 'demoted' }
}

function handleRemoveFromTeam(
	transaction: any,
	teamRef: any,
	teamData: any,
	playerRef: any,
	playerData: any,
	playerId: string
) {
	// Check if removing the last captain
	const isPlayerCaptain = teamData.roster?.some(
		(member: any) => member.player.id === playerId && member.captain
	)
	const captainCount =
		teamData.roster?.filter((member: any) => member.captain).length || 0

	if (isPlayerCaptain && captainCount <= 1) {
		throw new Error('Cannot remove the last captain')
	}

	// Update team roster
	const updatedRoster =
		teamData.roster?.filter((member: any) => member.player.id !== playerId) ||
		[]

	transaction.update(teamRef, { roster: updatedRoster })

	// Update player seasons
	const updatedSeasons =
		playerData.seasons?.map((season: any) => {
			if (season.team?.id === teamRef.id) {
				return { ...season, captain: false, team: null }
			}
			return season
		}) || []

	transaction.update(playerRef, { seasons: updatedSeasons })

	return { success: true, action: 'removed' }
}
