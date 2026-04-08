/**
 * Update team roster callable function
 *
 * Handles player management actions on a team: promote, demote, or remove.
 * Captain status lives on the player season subdoc — there is exactly one
 * write per state change, no dual-update of team and player.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { validateAuthentication } from '../../../shared/auth.js'
import {
	getCurrentSeason,
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../../shared/database.js'
import {
	removePlayerFromTeam,
	setPlayerCaptainStatus,
} from '../../../shared/membership.js'
import { formatDateForUser } from '../../../shared/format.js'
import { FIREBASE_CONFIG, TEAM_CONFIG } from '../../../config/constants.js'
import { Collections } from '../../../types.js'

interface UpdateTeamRosterRequest {
	teamId: string
	playerId: string
	action: 'promote' | 'demote' | 'remove'
	timezone?: string
}

export const updateTeamRoster = onCall<UpdateTeamRosterRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		validateAuthentication(request.auth)

		const { teamId, playerId, action, timezone } = request.data
		const userId = request.auth.uid

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
			const currentSeason = await getCurrentSeason()
			if (!currentSeason) {
				throw new HttpsError('not-found', 'No current season found')
			}
			const seasonId = currentSeason.id

			// Read the season doc to validate registration window.
			const seasonDocRef = firestore
				.collection(Collections.SEASONS)
				.doc(seasonId)
			const seasonSnap = await seasonDocRef.get()
			if (!seasonSnap.exists) {
				throw new HttpsError('not-found', 'Season not found')
			}
			const seasonData = seasonSnap.data()
			if (!seasonData) {
				throw new HttpsError('internal', 'Invalid season data')
			}

			// Verify the team season + roster entry exist.
			const teamSeasonDocRef = teamSeasonRef(firestore, teamId, seasonId)
			const teamSeasonSnap = await teamSeasonDocRef.get()
			if (!teamSeasonSnap.exists) {
				throw new HttpsError('not-found', 'Team not found for this season')
			}
			const teamSeasonData = teamSeasonSnap.data()

			const targetRosterRef = teamRosterEntryRef(
				firestore,
				teamId,
				seasonId,
				playerId
			)
			const targetRosterSnap = await targetRosterRef.get()
			if (!targetRosterSnap.exists) {
				throw new HttpsError('not-found', 'Player is not on this team')
			}

			// Authorization: load the caller's player season subdoc to check captain.
			const callerSeasonRef = playerSeasonRef(firestore, userId, seasonId)
			const callerSeasonSnap = await callerSeasonRef.get()
			const callerSeasonData = callerSeasonSnap.data()
			const userIsCaptain =
				callerSeasonData?.team?.id === teamId &&
				callerSeasonData?.captain === true

			// Admin bypass for the registration window.
			const callerPlayerSnap = await firestore
				.collection(Collections.PLAYERS)
				.doc(userId)
				.get()
			const isAdmin = callerPlayerSnap.data()?.admin === true

			if (!isAdmin) {
				const now = new Date()
				const registrationEnd = seasonData.registrationEnd.toDate()
				if (now > registrationEnd) {
					throw new HttpsError(
						'failed-precondition',
						`Team roster changes are not allowed after registration has closed. Registration ended ${formatDateForUser(registrationEnd, timezone)}.`
					)
				}
			}

			// Captains can manage any player; any player can remove themselves.
			const canPerformAction =
				userIsCaptain || (action === 'remove' && playerId === userId)
			if (!canPerformAction) {
				if (action === 'remove') {
					throw new HttpsError(
						'permission-denied',
						'You can only remove yourself from the team'
					)
				}
				throw new HttpsError(
					'permission-denied',
					'Only team captains can manage team players'
				)
			}

			// Common: load the target player's season subdoc.
			const targetSeasonRef = playerSeasonRef(firestore, playerId, seasonId)
			const targetSeasonSnap = await targetSeasonRef.get()
			if (!targetSeasonSnap.exists) {
				throw new HttpsError('not-found', 'Target player has no season record')
			}

			switch (action) {
				case 'promote': {
					await firestore.runTransaction((txn) => {
						setPlayerCaptainStatus(txn, firestore, {
							playerId,
							seasonId,
							captain: true,
						})
						return Promise.resolve()
					})
					logger.info('Promoted player to captain', { teamId, playerId })
					return {
						success: true,
						action: 'promoted',
						message: 'Player promoted to captain',
					}
				}

				case 'demote': {
					// Last-captain check: count captains on this team's roster by reading
					// each player's season subdoc.
					const rosterSnap = await teamSeasonDocRef.collection('roster').get()
					const captainSeasons = await Promise.all(
						rosterSnap.docs.map((d) =>
							playerSeasonRef(firestore, d.id, seasonId).get()
						)
					)
					const captainCount = captainSeasons.filter(
						(snap) => snap.data()?.captain === true
					).length
					if (captainCount <= 1) {
						throw new HttpsError(
							'failed-precondition',
							'Cannot demote the last captain. You must promote another player to captain first.'
						)
					}
					await firestore.runTransaction((txn) => {
						setPlayerCaptainStatus(txn, firestore, {
							playerId,
							seasonId,
							captain: false,
						})
						return Promise.resolve()
					})
					logger.info('Demoted player from captain', { teamId, playerId })
					return {
						success: true,
						action: 'demoted',
						message: 'Player demoted from captain',
					}
				}

				case 'remove': {
					const rosterSnap = await teamSeasonDocRef.collection('roster').get()
					const rosterPlayerSeasonSnaps = await Promise.all(
						rosterSnap.docs.map((d) =>
							playerSeasonRef(firestore, d.id, seasonId).get()
						)
					)

					// Last-captain check.
					const captainCount = rosterPlayerSeasonSnaps.filter(
						(snap) => snap.data()?.captain === true
					).length
					const targetIsCaptain = targetSeasonSnap.data()?.captain === true
					if (targetIsCaptain && captainCount <= 1) {
						throw new HttpsError(
							'failed-precondition',
							'Cannot remove the last captain. You must promote another player to captain before leaving the team.'
						)
					}

					// Registered-team threshold check: would this departure drop the
					// team below the minimum?
					if (teamSeasonData?.registered) {
						const minPlayersRequired = TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION
						const remainingRegistered = rosterPlayerSeasonSnaps.filter(
							(snap, i) => {
								if (rosterSnap.docs[i].id === playerId) return false
								const data = snap.data()
								return Boolean(data?.paid && data?.signed)
							}
						).length
						if (remainingRegistered < minPlayersRequired) {
							throw new HttpsError(
								'failed-precondition',
								`You cannot leave your team at this time. Your departure would cause the team to lose its registered status. The team needs at least ${minPlayersRequired} fully registered players (paid and signed waiver), but would only have ${remainingRegistered} after your departure.`
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

					logger.info('Removed player from team', { teamId, playerId })
					return {
						success: true,
						action: 'removed',
						message: 'Player removed from team',
					}
				}

				default:
					throw new HttpsError('invalid-argument', 'Invalid action')
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'
			logger.error('Error updating team roster:', {
				teamId,
				playerId,
				action,
				userId,
				error: errorMessage,
			})
			if (error instanceof HttpsError) throw error
			throw new HttpsError('failed-precondition', errorMessage)
		}
	}
)
