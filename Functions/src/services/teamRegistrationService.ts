/**
 * Team registration status management service
 *
 * Decides whether a team has met the season's registration requirements and,
 * if so, claims one of the season's limited spots for it.
 */

import {
	getFirestore,
	FieldValue,
	type Firestore,
} from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { TEAM_CONFIG } from '../config/constants.js'
import { Collections } from '../types.js'
import { playerSeasonRef, teamSeasonRef } from '../shared/database.js'

/**
 * Recompute the registration status of a team for a specific season.
 *
 * Registration is a **race for a limited number of spots**, so the whole
 * decision happens in one transaction: count the qualifying roster members,
 * check the season still has room, claim a spot and set the flag. Doing it in
 * separate steps allows two teams to both see eleven taken and both become
 * the twelfth.
 *
 * The count of claimed spots lives on the season document as
 * `registeredTeamCount`, which is what makes the check atomic — a
 * collection-group count of registered teams cannot be read consistently
 * inside a transaction, and reading it outside one is the bug.
 *
 * **Registration is irreversible.** A team that has claimed a spot keeps it
 * for the season even if its roster later falls below the threshold; the spot
 * is gone either way, and under team-level payment there is money attached to
 * it. Reversing a registration is an administrative act that has to settle
 * that money, not something this function does as a side effect of someone
 * leaving a roster.
 */
export async function updateTeamRegistrationStatus(
	teamId: string,
	seasonId: string
): Promise<void> {
	const firestore = getFirestore()

	try {
		const result = await claimSpotIfQualified(firestore, teamId, seasonId)

		if (result.outcome === 'registered') {
			logger.info('Team registered', {
				teamId,
				seasonId,
				qualifyingPlayers: result.qualifyingPlayers,
				spotsClaimed: result.spotsClaimed,
			})
			return
		}

		if (result.outcome === 'season-full') {
			logger.info('Team qualified but the season is full', {
				teamId,
				seasonId,
				qualifyingPlayers: result.qualifyingPlayers,
				spotsClaimed: result.spotsClaimed,
			})
		}
	} catch (error) {
		logger.error('Error updating team registration status:', {
			teamId,
			seasonId,
			error: error instanceof Error ? error.message : 'Unknown error',
		})
		throw error
	}
}

type ClaimOutcome =
	| { outcome: 'registered'; qualifyingPlayers: number; spotsClaimed: number }
	| { outcome: 'season-full'; qualifyingPlayers: number; spotsClaimed: number }
	| { outcome: 'not-qualified'; qualifyingPlayers: number }
	| { outcome: 'already-registered' }
	| { outcome: 'no-team-season' }

/**
 * The transaction itself, separated so its outcomes can be asserted directly.
 */
async function claimSpotIfQualified(
	firestore: Firestore,
	teamId: string,
	seasonId: string
): Promise<ClaimOutcome> {
	const teamSeasonDocRef = teamSeasonRef(firestore, teamId, seasonId)
	const seasonDocRef = firestore.collection(Collections.SEASONS).doc(seasonId)

	return firestore.runTransaction(async (transaction) => {
		// ---- Reads. Firestore requires all of them before any write. ----
		const teamSeasonSnap = await transaction.get(teamSeasonDocRef)
		if (!teamSeasonSnap.exists) {
			logger.warn(
				`Team season not found: teams/${teamId}/teamSeasons/${seasonId}`
			)
			return { outcome: 'no-team-season' }
		}

		// A claimed spot is never given back, so there is nothing to recompute.
		if (teamSeasonSnap.data()?.registered === true) {
			return { outcome: 'already-registered' }
		}

		const rosterSnap = await transaction.get(
			teamSeasonDocRef.collection('roster')
		)
		const playerSeasons = await Promise.all(
			rosterSnap.docs.map((rosterDoc) =>
				transaction.get(playerSeasonRef(firestore, rosterDoc.id, seasonId))
			)
		)
		const qualifyingPlayers = playerSeasons.filter((snap) => {
			if (!snap.exists) return false
			const data = snap.data()
			return Boolean(data?.paid && data?.signed)
		}).length

		if (qualifyingPlayers < TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION) {
			return { outcome: 'not-qualified', qualifyingPlayers }
		}

		const seasonSnap = await transaction.get(seasonDocRef)
		// Absent on seasons created before the counter existed; the backfill in
		// scripts/migrations/2026-registered-team-count sets it.
		const spotsClaimed = seasonSnap.data()?.registeredTeamCount ?? 0

		if (spotsClaimed >= TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK) {
			return { outcome: 'season-full', qualifyingPlayers, spotsClaimed }
		}

		// ---- Writes. ----
		transaction.update(seasonDocRef, {
			registeredTeamCount: FieldValue.increment(1),
		})
		transaction.update(teamSeasonDocRef, {
			registered: true,
			registeredDate: FieldValue.serverTimestamp(),
		})

		return {
			outcome: 'registered',
			qualifyingPlayers,
			spotsClaimed: spotsClaimed + 1,
		}
	})
}
