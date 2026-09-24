/**
 * Team registration status management service
 *
 * Decides whether a team has met the season's registration requirements and,
 * if so, claims one of the season's limited spots for it.
 *
 * Two rules, chosen by whether the season sets
 * `teamRegistrationTotalCents`:
 *
 * - **Per-player** (the original): ten roster members each individually paid
 *   and signed.
 * - **Team-total**: ten roster members who have signed, plus that much money
 *   committed by any of them, in any split. A player is registered by their
 *   waiver; the money belongs to the team.
 */

import {
	getFirestore,
	FieldValue,
	type Firestore,
} from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { TEAM_CONFIG } from '../config/constants.js'
import {
	Collections,
	type PlayerSeasonDocument,
	type SeasonDocument,
	type TeamContributionDocument,
} from '../types.js'
import {
	committedCents,
	teamContributionsCollection,
} from '../shared/contributions.js'
import { playerSeasonRef, teamSeasonRef } from '../shared/database.js'

/**
 * Whether a player counts toward their team's ten, under whichever rule the
 * season uses. The one definition, so the registration check and the check
 * that a departure would not break a registered team cannot disagree — they
 * did, and under team-total pricing nobody on a registered team could leave.
 *
 * Checked by type rather than presence, so a total cleared to null falls
 * back to the per-player rule instead of a $0 team total.
 */
export function countsTowardRegistration(
	playerSeason: Pick<PlayerSeasonDocument, 'paid' | 'signed'> | undefined,
	season: Pick<SeasonDocument, 'teamRegistrationTotalCents'> | undefined
): boolean {
	if (!playerSeason?.signed) return false
	// Under team-total pricing the money is the team's; a player qualifies by
	// signing. Per-player pricing also needs their own payment.
	return typeof season?.teamRegistrationTotalCents === 'number'
		? true
		: Boolean(playerSeason.paid)
}

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

		if (result.outcome === 'underfunded') {
			logger.info('Team has its players but not yet the money', {
				teamId,
				seasonId,
				qualifyingPlayers: result.qualifyingPlayers,
				committedCents: result.committedCents,
				requiredCents: result.requiredCents,
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
	| {
			outcome: 'underfunded'
			qualifyingPlayers: number
			committedCents: number
			requiredCents: number
	  }
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

		// The season decides which rule applies, so it is read before the
		// roster rather than after.
		const seasonSnap = await transaction.get(seasonDocRef)
		const seasonData = seasonSnap.data() as SeasonDocument | undefined
		// Checked by type rather than presence, so a field cleared to null
		// falls back to the per-player rule instead of a $0 team total.
		const teamTotalCents =
			typeof seasonData?.teamRegistrationTotalCents === 'number'
				? seasonData.teamRegistrationTotalCents
				: undefined

		const rosterSnap = await transaction.get(
			teamSeasonDocRef.collection('roster')
		)
		const playerSeasons = await Promise.all(
			rosterSnap.docs.map((rosterDoc) =>
				transaction.get(playerSeasonRef(firestore, rosterDoc.id, seasonId))
			)
		)

		// Under team-total pricing a player qualifies by signing their waiver.
		// Payment is the team's business, not theirs: one person can cover the
		// whole roster, which would leave everyone else unpaid and the team
		// permanently unable to register under the original rule.
		const qualifyingPlayers = playerSeasons.filter(
			(snap) =>
				snap.exists &&
				countsTowardRegistration(
					snap.data() as PlayerSeasonDocument | undefined,
					seasonData
				)
		).length

		if (qualifyingPlayers < TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION) {
			return { outcome: 'not-qualified', qualifyingPlayers }
		}

		if (teamTotalCents !== undefined) {
			const contributionsSnap = await transaction.get(
				teamContributionsCollection(firestore, teamId, seasonId)
			)
			const committed = committedCents(
				contributionsSnap.docs.map(
					(doc) => doc.data() as TeamContributionDocument
				)
			)

			if (committed < teamTotalCents) {
				return {
					outcome: 'underfunded',
					qualifyingPlayers,
					committedCents: committed,
					requiredCents: teamTotalCents,
				}
			}
		}

		// Absent on seasons created before the counter existed; the backfill in
		// scripts/migrations/2026-registered-team-count sets it.
		const spotsClaimed = seasonData?.registeredTeamCount ?? 0

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
