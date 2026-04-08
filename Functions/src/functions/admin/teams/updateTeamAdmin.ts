/**
 * Update team (admin) callable function
 *
 * Allows admins to edit a team's per-season fields and roster:
 * - Team name (per season)
 * - Roster management (add/remove players, change captain status)
 *
 * Captain status, paid, signed, banned all live on the player season subdoc.
 * The team's roster subcollection is the pure membership join.
 */

import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { validateAdminUser } from '../../../shared/auth.js'
import { cancelPendingOffersForPlayer } from '../../../shared/offers.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../../shared/database.js'
import {
	addPlayerToTeam,
	removePlayerFromTeam,
	setPlayerCaptainStatus,
} from '../../../shared/membership.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import {
	type DocumentReference,
	type PlayerDocument,
	type SeasonDocument,
} from '../../../types.js'

interface AddPlayerRequest {
	playerId: string
	captain: boolean
}

interface CaptainStatusUpdate {
	playerId: string
	captain: boolean
}

interface RosterChanges {
	addPlayers?: AddPlayerRequest[]
	removePlayers?: string[]
	updateCaptainStatus?: CaptainStatusUpdate[]
}

interface UpdateTeamAdminRequest {
	/** Canonical team id */
	teamId: string
	/** Season being edited */
	seasonId: string
	/** New team name (optional) */
	name?: string
	/** Roster changes (optional) */
	rosterChanges?: RosterChanges
}

interface UpdateTeamAdminResponse {
	success: true
	teamId: string
	seasonId: string
	message: string
	changes: {
		name?: { from: string; to: string }
		rosterAdded?: string[]
		rosterRemoved?: string[]
		captainChanges?: { playerId: string; from: boolean; to: boolean }[]
	}
}

export const updateTeamAdmin = onCall<
	UpdateTeamAdminRequest,
	Promise<UpdateTeamAdminResponse>
>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<UpdateTeamAdminResponse> => {
		const { auth, data } = request

		logger.info('updateTeamAdmin called', {
			adminUserId: auth?.uid,
			targetTeamId: data.teamId,
			seasonId: data.seasonId,
			hasNameUpdate: !!data.name,
			hasRosterChanges: !!data.rosterChanges,
		})

		const firestore = getFirestore()
		await validateAdminUser(auth, firestore)

		const { teamId, seasonId, name, rosterChanges } = data

		if (!teamId || !seasonId) {
			throw new HttpsError(
				'invalid-argument',
				'Team ID and season ID are required'
			)
		}

		if (!name && !rosterChanges) {
			throw new HttpsError(
				'invalid-argument',
				'At least one field to update is required'
			)
		}

		if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
			throw new HttpsError(
				'invalid-argument',
				'Team name must be a non-empty string'
			)
		}

		const teamSeasonDocRef = teamSeasonRef(firestore, teamId, seasonId)

		// Verify team season exists.
		const teamSeasonSnap = await teamSeasonDocRef.get()
		if (!teamSeasonSnap.exists) {
			throw new HttpsError('not-found', 'Team not found for this season')
		}
		const teamSeasonData = teamSeasonSnap.data()
		if (!teamSeasonData) {
			throw new HttpsError('internal', 'Unable to retrieve team season data')
		}
		const seasonRef = teamSeasonData.season as DocumentReference<SeasonDocument>

		const changes: UpdateTeamAdminResponse['changes'] = {}

		// 1. Name update on the team season subdoc.
		if (name && name.trim() !== teamSeasonData.name) {
			const trimmedName = name.trim()
			changes.name = { from: teamSeasonData.name, to: trimmedName }
			await teamSeasonDocRef.update({ name: trimmedName })
			logger.info('Updated team name', {
				teamId,
				seasonId,
				from: teamSeasonData.name,
				to: trimmedName,
			})
		}

		// 2. Roster changes — handled per operation, no transactional rebuild.
		const addedPlayerIds: string[] = []
		if (rosterChanges) {
			// 2a. Add players.
			if (rosterChanges.addPlayers && rosterChanges.addPlayers.length > 0) {
				changes.rosterAdded = []
				for (const { playerId, captain } of rosterChanges.addPlayers) {
					const playerDocRef = firestore
						.collection('players')
						.doc(playerId) as DocumentReference<PlayerDocument>
					const playerDoc = await playerDocRef.get()
					if (!playerDoc.exists) {
						throw new HttpsError('not-found', `Player not found: ${playerId}`)
					}

					// Check if already on this team via roster subcollection.
					const rosterEntryRef = teamRosterEntryRef(
						firestore,
						teamId,
						seasonId,
						playerId
					)
					if ((await rosterEntryRef.get()).exists) {
						throw new HttpsError(
							'already-exists',
							`Player ${playerId} is already on this team`
						)
					}

					// Check if player is on another team for this season via player season subdoc.
					const playerSeasonDocRef = playerSeasonRef(
						firestore,
						playerId,
						seasonId
					)
					const playerSeasonSnap = await playerSeasonDocRef.get()
					const playerSeasonData = playerSeasonSnap.data()
					if (playerSeasonData?.team && playerSeasonData.team.id !== teamId) {
						throw new HttpsError(
							'failed-precondition',
							`Player ${playerId} is already on another team for this season`
						)
					}

					// Atomic add: create roster entry + create-or-update player season.
					await firestore.runTransaction((txn) => {
						addPlayerToTeam(txn, firestore, {
							playerId,
							teamId,
							seasonId,
							seasonRef,
							captain,
							existingPlayerSeason: playerSeasonSnap.exists
								? (playerSeasonData ?? null)
								: null,
						})
						return Promise.resolve()
					})

					changes.rosterAdded.push(playerId)
					addedPlayerIds.push(playerId)
					logger.info('Added player to team roster', {
						teamId,
						seasonId,
						playerId,
						captain,
					})
				}
			}

			// 2b. Remove players.
			if (
				rosterChanges.removePlayers &&
				rosterChanges.removePlayers.length > 0
			) {
				changes.rosterRemoved = []

				// Last-captain check requires reading all roster + player season subdocs once.
				const rosterSnap = await teamSeasonDocRef.collection('roster').get()
				const playerSeasonSnaps = await Promise.all(
					rosterSnap.docs.map((d) =>
						playerSeasonRef(firestore, d.id, seasonId).get()
					)
				)
				const captainSetByPlayerId = new Map<string, boolean>()
				for (let i = 0; i < rosterSnap.docs.length; i++) {
					captainSetByPlayerId.set(
						rosterSnap.docs[i].id,
						playerSeasonSnaps[i].data()?.captain === true
					)
				}

				for (const playerId of rosterChanges.removePlayers) {
					const rosterEntryRef = teamRosterEntryRef(
						firestore,
						teamId,
						seasonId,
						playerId
					)
					if (!(await rosterEntryRef.get()).exists) {
						throw new HttpsError(
							'not-found',
							`Player ${playerId} is not on this team's roster`
						)
					}

					const targetIsCaptain = captainSetByPlayerId.get(playerId) === true
					if (targetIsCaptain) {
						const otherCaptains = Array.from(
							captainSetByPlayerId.entries()
						).filter(([id, isCap]) => isCap && id !== playerId)
						if (otherCaptains.length === 0) {
							throw new HttpsError(
								'failed-precondition',
								`Cannot remove ${playerId}: they are the only captain. Promote another player first.`
							)
						}
					}

					await firestore.runTransaction((txn) => {
						removePlayerFromTeam(txn, firestore, {
							playerId,
							teamId,
							seasonId,
						})
						return Promise.resolve()
					})

					captainSetByPlayerId.delete(playerId)
					changes.rosterRemoved.push(playerId)
					logger.info('Removed player from team roster', {
						teamId,
						seasonId,
						playerId,
					})
				}
			}

			// 2c. Captain status updates.
			if (
				rosterChanges.updateCaptainStatus &&
				rosterChanges.updateCaptainStatus.length > 0
			) {
				changes.captainChanges = []

				const rosterSnap = await teamSeasonDocRef.collection('roster').get()
				const playerSeasonSnaps = await Promise.all(
					rosterSnap.docs.map((d) =>
						playerSeasonRef(firestore, d.id, seasonId).get()
					)
				)
				const captainSetByPlayerId = new Map<string, boolean>()
				for (let i = 0; i < rosterSnap.docs.length; i++) {
					captainSetByPlayerId.set(
						rosterSnap.docs[i].id,
						playerSeasonSnaps[i].data()?.captain === true
					)
				}

				for (const { playerId, captain } of rosterChanges.updateCaptainStatus) {
					const currentCaptainStatus = captainSetByPlayerId.get(playerId)
					if (currentCaptainStatus === undefined) {
						throw new HttpsError(
							'not-found',
							`Player ${playerId} is not on this team's roster`
						)
					}
					if (currentCaptainStatus === captain) continue

					if (currentCaptainStatus && !captain) {
						const otherCaptains = Array.from(
							captainSetByPlayerId.entries()
						).filter(([id, isCap]) => isCap && id !== playerId)
						if (otherCaptains.length === 0) {
							throw new HttpsError(
								'failed-precondition',
								`Cannot demote ${playerId}: they are the only captain. Promote another player first.`
							)
						}
					}

					await firestore.runTransaction((txn) => {
						setPlayerCaptainStatus(txn, firestore, {
							playerId,
							seasonId,
							captain,
						})
						return Promise.resolve()
					})
					captainSetByPlayerId.set(playerId, captain)

					changes.captainChanges.push({
						playerId,
						from: currentCaptainStatus,
						to: captain,
					})
					logger.info('Updated player captain status', {
						teamId,
						seasonId,
						playerId,
						from: currentCaptainStatus,
						to: captain,
					})
				}
			}
		}

		// Cancel pending offers for added players (outside any transaction).
		for (const playerId of addedPlayerIds) {
			const playerDocRef = firestore
				.collection('players')
				.doc(playerId) as DocumentReference<PlayerDocument>
			try {
				await cancelPendingOffersForPlayer(
					firestore,
					playerDocRef,
					seasonRef,
					'Player was added to a team by an administrator'
				)
			} catch (error) {
				logger.warn('Failed to cancel pending offers for player', {
					playerId,
					error: error instanceof Error ? error.message : 'Unknown error',
				})
			}
		}

		logger.info('Successfully updated team', {
			teamId,
			seasonId,
			adminUserId: auth?.uid,
			changes,
		})

		return {
			success: true,
			teamId,
			seasonId,
			message: 'Team updated successfully',
			changes,
		}
	}
)
