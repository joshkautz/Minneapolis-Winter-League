/**
 * Update team roster callable function
 *
 * Handles player management actions on a team: promote, demote, or remove.
 * Captain status lives on the player season subdoc — there is exactly one
 * write per state change, no dual-update of team and player.
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - Registration must be open, unless the caller is an admin
 * - Only a captain of the team may promote, demote or remove; any player may
 *   remove themselves
 * - A team never loses its last captain
 * - A registered team never drops below the registration minimum
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
import { FIREBASE_CONFIG, TEAM_CONFIG } from '../../../config/constants.js'
import {
	Collections,
	type PlayerSeasonDocument,
	type SeasonDocument,
} from '../../../types.js'
import { countsTowardRegistration } from '../../../services/teamRegistrationService.js'
import { assertRegistrationOpen } from '../../../shared/registrationWindow.js'

interface UpdateTeamRosterRequest {
	teamId: string
	playerId: string
	action: 'promote' | 'demote' | 'remove'
	timezone?: string
}

const ROSTER_RESULTS = {
	promote: {
		success: true,
		action: 'promoted',
		message: 'Player promoted to captain',
	},
	demote: {
		success: true,
		action: 'demoted',
		message: 'Player demoted from captain',
	},
	remove: {
		success: true,
		action: 'removed',
		message: 'Player removed from team',
	},
} as const

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
			const seasonData = seasonSnap.data() as SeasonDocument | undefined
			if (!seasonData) {
				throw new HttpsError('internal', 'Invalid season data')
			}

			const callerPlayerSnap = await firestore
				.collection(Collections.PLAYERS)
				.doc(userId)
				.get()
			const isAdmin = callerPlayerSnap.data()?.admin === true

			if (!isAdmin) {
				assertRegistrationOpen(
					seasonData,
					'Team roster changes are not allowed after registration has closed.',
					timezone
				)
			}

			const teamSeasonDocRef = teamSeasonRef(firestore, teamId, seasonId)

			// Every check on the team's state is made inside the transaction
			// that acts on it. Made outside, two captains demoting each other at
			// once would both see two captains and leave the team with none.
			await firestore.runTransaction(async (txn) => {
				const [teamSeasonSnap, targetRosterSnap, rosterSnap] =
					await Promise.all([
						txn.get(teamSeasonDocRef),
						txn.get(teamRosterEntryRef(firestore, teamId, seasonId, playerId)),
						txn.get(teamSeasonDocRef.collection('roster')),
					])
				if (!teamSeasonSnap.exists) {
					throw new HttpsError('not-found', 'Team not found for this season')
				}
				if (!targetRosterSnap.exists) {
					throw new HttpsError('not-found', 'Player is not on this team')
				}

				const [callerSeasonSnap, targetSeasonSnap, ...rosterSeasonSnaps] =
					await Promise.all(
						[userId, playerId, ...rosterSnap.docs.map((d) => d.id)].map((id) =>
							txn.get(playerSeasonRef(firestore, id, seasonId))
						)
					)

				// Captains can manage any player; any player can remove themselves.
				const callerSeason = callerSeasonSnap.data()
				const userIsCaptain =
					callerSeason?.team?.id === teamId && callerSeason?.captain === true
				if (!userIsCaptain && !(action === 'remove' && playerId === userId)) {
					throw new HttpsError(
						'permission-denied',
						action === 'remove'
							? 'You can only remove yourself from the team'
							: 'Only team captains can manage team players'
					)
				}

				if (!targetSeasonSnap.exists) {
					throw new HttpsError(
						'not-found',
						'Target player has no season record'
					)
				}

				const captainCount = rosterSeasonSnaps.filter(
					(snap) => snap.data()?.captain === true
				).length
				const targetIsCaptain = targetSeasonSnap.data()?.captain === true

				switch (action) {
					case 'promote':
						setPlayerCaptainStatus(txn, firestore, {
							playerId,
							seasonId,
							captain: true,
						})
						return

					case 'demote':
						if (captainCount <= 1) {
							throw new HttpsError(
								'failed-precondition',
								'Cannot demote the last captain. You must promote another player to captain first.'
							)
						}
						setPlayerCaptainStatus(txn, firestore, {
							playerId,
							seasonId,
							captain: false,
						})
						return

					case 'remove': {
						if (targetIsCaptain && captainCount <= 1) {
							throw new HttpsError(
								'failed-precondition',
								'Cannot remove the last captain. You must promote another player to captain before leaving the team.'
							)
						}

						// Would this departure drop a registered team below the minimum?
						if (teamSeasonSnap.data()?.registered) {
							const minPlayersRequired =
								TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION
							const remainingRegistered = rosterSeasonSnaps.filter(
								(snap, i) =>
									rosterSnap.docs[i].id !== playerId &&
									countsTowardRegistration(
										snap.data() as PlayerSeasonDocument | undefined,
										seasonData
									)
							).length
							if (remainingRegistered < minPlayersRequired) {
								throw new HttpsError(
									'failed-precondition',
									`You cannot leave your team at this time. Your departure would cause the team to lose its registered status. The team needs at least ${minPlayersRequired} registered players, but would only have ${remainingRegistered} after your departure.`
								)
							}
						}

						removePlayerFromTeam(txn, firestore, {
							playerId,
							teamId,
							seasonId,
						})
					}
				}
			})

			logger.info(`Team roster ${action}`, { teamId, playerId, userId })
			return ROSTER_RESULTS[action]
		} catch (error) {
			if (error instanceof HttpsError) throw error
			logger.error('Error updating team roster:', {
				teamId,
				playerId,
				action,
				userId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw new HttpsError(
				'internal',
				'The roster could not be changed. Please try again.'
			)
		}
	}
)
