/**
 * Update team (admin) callable function
 *
 * Allows admins to edit a team's per-season fields and roster:
 * - Team name (per season)
 * - Roster management (add/remove players, change captain status)
 *
 * Captain status, paid and signed live on the player season subdoc.
 * The team's roster subcollection is the pure membership join.
 *
 * Security validations:
 * - Caller must be an admin
 * - A new name must be 2–50 characters (admins skip the profanity filter)
 * - A player added must exist and not be on another team this season
 * - The team is never left without a captain
 * - The request is applied whole, in one transaction, or not at all
 */

import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { validateAdminUser } from '../../../shared/auth.js'
import { cancelPendingOffersForPlayer } from '../../../shared/offers.js'
import { playerSeasonRef, teamSeasonRef } from '../../../shared/database.js'
import {
	addPlayerToTeam,
	removePlayerFromTeam,
	setPlayerCaptainStatus,
} from '../../../shared/membership.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { validateTeamName } from '../../../shared/names.js'
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
	{ region: FIREBASE_CONFIG.REGION },
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

		// An admin is trusted with language, as for player names, but not
		// with a name too long for every table it appears in.
		const teamName =
			name === undefined
				? undefined
				: validateTeamName(name, { checkProfanity: false })

		const addPlayers = rosterChanges?.addPlayers ?? []
		const removePlayers = rosterChanges?.removePlayers ?? []
		const captainUpdates = rosterChanges?.updateCaptainStatus ?? []
		const teamSeasonDocRef = teamSeasonRef(firestore, teamId, seasonId)

		// Everything is read, checked against the roster as it will be after
		// every change, and written in one transaction: a request is applied
		// whole or not at all. Applied one change at a time, a refusal halfway
		// through left the earlier changes in place behind an error.
		const { changes, seasonRef } = await firestore.runTransaction(
			async (txn) => {
				const teamSeasonSnap = await txn.get(teamSeasonDocRef)
				const teamSeasonData = teamSeasonSnap.data()
				if (!teamSeasonSnap.exists || !teamSeasonData) {
					throw new HttpsError('not-found', 'Team not found for this season')
				}
				const seasonDocRef =
					teamSeasonData.season as DocumentReference<SeasonDocument>

				const rosterSnap = await txn.get(teamSeasonDocRef.collection('roster'))
				const rosterIds = rosterSnap.docs.map((doc) => doc.id)
				const addIds = addPlayers.map(({ playerId }) => playerId)
				const [rosterSeasonSnaps, addSeasonSnaps, addPlayerSnaps] =
					await Promise.all([
						Promise.all(
							rosterIds.map((id) =>
								txn.get(playerSeasonRef(firestore, id, seasonId))
							)
						),
						Promise.all(
							addIds.map((id) =>
								txn.get(playerSeasonRef(firestore, id, seasonId))
							)
						),
						Promise.all(
							addIds.map((id) =>
								txn.get(firestore.collection('players').doc(id))
							)
						),
					])

				// Captain status by player, for the roster as it stands and then
				// as each change leaves it.
				const captains = new Map<string, boolean>(
					rosterIds.map((id, i) => [
						id,
						rosterSeasonSnaps[i].data()?.captain === true,
					])
				)
				const result: UpdateTeamAdminResponse['changes'] = {}
				// Removing or demoting a captain must leave one: without a
				// captain nobody can manage the roster.
				let lostACaptain = false

				if (teamName !== undefined && teamName !== teamSeasonData.name) {
					result.name = { from: teamSeasonData.name, to: teamName }
				}

				addPlayers.forEach(({ playerId, captain }, i) => {
					if (!addPlayerSnaps[i].exists) {
						throw new HttpsError('not-found', 'That player does not exist.')
					}
					if (captains.has(playerId)) {
						throw new HttpsError(
							'already-exists',
							'That player is already on this team.'
						)
					}
					const otherTeam = addSeasonSnaps[i].data()?.team
					if (otherTeam && otherTeam.id !== teamId) {
						throw new HttpsError(
							'failed-precondition',
							'That player is already on another team this season. Remove them from it first.'
						)
					}
					captains.set(playerId, captain)
				})

				for (const playerId of removePlayers) {
					if (!captains.has(playerId)) {
						throw new HttpsError(
							'not-found',
							"That player is not on this team's roster."
						)
					}
					if (captains.get(playerId)) lostACaptain = true
					captains.delete(playerId)
				}

				const captainChanges: NonNullable<
					UpdateTeamAdminResponse['changes']['captainChanges']
				> = []
				for (const { playerId, captain } of captainUpdates) {
					const current = captains.get(playerId)
					if (current === undefined) {
						throw new HttpsError(
							'not-found',
							"That player is not on this team's roster."
						)
					}
					if (current === captain) continue
					if (current) lostACaptain = true
					captains.set(playerId, captain)
					captainChanges.push({ playerId, from: current, to: captain })
				}

				if (lostACaptain && ![...captains.values()].some(Boolean)) {
					throw new HttpsError(
						'failed-precondition',
						'That would leave the team without a captain. Promote another player first.'
					)
				}

				// Every check has passed: write.
				if (result.name) {
					txn.update(teamSeasonDocRef, { name: result.name.to })
				}
				addPlayers.forEach(({ playerId, captain }, i) => {
					addPlayerToTeam(txn, firestore, {
						playerId,
						teamId,
						seasonId,
						seasonRef: seasonDocRef,
						captain,
						existingPlayerSeason: addSeasonSnaps[i].data() ?? null,
					})
				})
				for (const playerId of removePlayers) {
					removePlayerFromTeam(txn, firestore, { playerId, teamId, seasonId })
				}
				for (const { playerId, to } of captainChanges) {
					setPlayerCaptainStatus(txn, firestore, {
						playerId,
						seasonId,
						captain: to,
					})
				}

				if (addIds.length > 0) result.rosterAdded = addIds
				if (removePlayers.length > 0) result.rosterRemoved = [...removePlayers]
				if (captainChanges.length > 0) result.captainChanges = captainChanges
				return { changes: result, seasonRef: seasonDocRef }
			}
		)
		const addedPlayerIds = changes.rosterAdded ?? []

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
