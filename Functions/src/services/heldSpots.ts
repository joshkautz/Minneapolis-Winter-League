/**
 * Held spots: last season's top three get a week to register before anyone
 * else can take their spots (docs/TEAM_PAYMENTS.md, "Held spots").
 *
 * Which teams, and when the holds end, are decided here; what a hold means
 * for a team trying to register is decided where spots are claimed
 * (`services/teamRegistration.ts`).
 */

import {
	FieldValue,
	type Firestore,
	type Timestamp,
} from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	TEAM_SEASONS_SUBCOLLECTION,
	type SeasonDocument,
	type TeamSeasonDocument,
} from '../types.js'
import { canonicalTeamIdFromTeamSeasonDoc } from '../shared/database.js'
import {
	HELD_SPOT_PLACEMENTS,
	heldSpotsEndMs,
} from '../shared/teamPaymentRules.js'
import { updateTeamRegistrationStatus } from './teamRegistration.js'

/** The teams a new season holds spots for, and the season they come from. */
export interface HeldSpotTeams {
	/** Best first; empty when the season before has no placements 1st–3rd. */
	teamIds: string[]
	/** The season before the new one, if there is one. */
	previousSeason: { id: string; name: string } | null
}

/**
 * The teams a new season starting at `dateStart` holds spots for: those that
 * finished 1st to 3rd in the season before it, best first. None when there
 * is no earlier season or it has no placements yet.
 */
export async function heldSpotTeamsFor(
	firestore: Firestore,
	dateStart: Timestamp
): Promise<HeldSpotTeams> {
	const previousSnap = await firestore
		.collection(Collections.SEASONS)
		.where('dateStart', '<', dateStart)
		.orderBy('dateStart', 'desc')
		.limit(1)
		.get()
	const previousSeason = previousSnap.docs[0]
	if (!previousSeason) return { teamIds: [], previousSeason: null }

	const teamSeasonsSnap = await firestore
		.collectionGroup(TEAM_SEASONS_SUBCOLLECTION)
		.where('season', '==', previousSeason.ref)
		.get()

	const teamIds = teamSeasonsSnap.docs
		.map((doc) => ({
			teamId: canonicalTeamIdFromTeamSeasonDoc(
				doc as FirebaseFirestore.QueryDocumentSnapshot<TeamSeasonDocument>
			),
			placement: (doc.data() as TeamSeasonDocument).placement,
		}))
		.filter(
			(team): team is { teamId: string; placement: number } =>
				typeof team.placement === 'number' &&
				team.placement >= 1 &&
				team.placement <= HELD_SPOT_PLACEMENTS
		)
		.sort((a, b) => a.placement - b.placement)
		.map((team) => team.teamId)

	return {
		teamIds,
		previousSeason: {
			id: previousSeason.id,
			name: (previousSeason.data() as SeasonDocument).name,
		},
	}
}

export interface ReleaseResult {
	seasonsReleased: string[]
	failures: { seasonId: string; teamId?: string; error: string }[]
}

/** Whether a season's held spots are due to be released at `now`. */
function holdsDue(season: SeasonDocument, now: Date): boolean {
	return (
		(season.heldSpotTeamIds?.length ?? 0) > 0 &&
		!season.heldSpotsReleasedAt &&
		now.getTime() >=
			heldSpotsEndMs({
				registrationStartMs: season.registrationStart.toMillis(),
				registrationEndMs: season.registrationEnd.toMillis(),
			})
	)
}

/**
 * Gives every team waiting in a season its turn, in the order it
 * qualified. Returns the team that could not be given its turn, if one
 * failed: it stops there rather than let a later team take the spot that
 * team was owed.
 */
async function giveWaitingTeamsTheirTurn(
	firestore: Firestore,
	seasonDoc: FirebaseFirestore.QueryDocumentSnapshot,
	now: Date
): Promise<{ teamId: string; error: string } | null> {
	const unregisteredSnap = await firestore
		.collectionGroup(TEAM_SEASONS_SUBCOLLECTION)
		.where('season', '==', seasonDoc.ref)
		.where('registered', '==', false)
		.get()
	const waiting = unregisteredSnap.docs
		.map((doc) => ({
			teamId: canonicalTeamIdFromTeamSeasonDoc(
				doc as FirebaseFirestore.QueryDocumentSnapshot<TeamSeasonDocument>
			),
			since: (doc.data() as TeamSeasonDocument).waitingForSpotSince,
		}))
		.filter((team): team is { teamId: string; since: Timestamp } =>
			Boolean(team.since)
		)
		.sort((a, b) => a.since.toMillis() - b.since.toMillis())

	for (const team of waiting) {
		try {
			await updateTeamRegistrationStatus(team.teamId, seasonDoc.id, {
				now,
				releasingHeldSpots: true,
			})
		} catch (error) {
			return {
				teamId: team.teamId,
				error: error instanceof Error ? error.message : 'Unknown error',
			}
		}
	}
	return null
}

/**
 * Ends the holds of every season whose week is up: each team waiting for a
 * spot gets its turn, in the order it qualified, and then the season records
 * the holds as over. A waiting team registers if a spot is open — one a held
 * team left unclaimed — and otherwise stays out, as any team would in a
 * full season.
 *
 * The waiting teams are found by a query, outside any transaction, so a
 * team can start waiting after it ran and before the holds are recorded
 * over. They are given a second turn once the holds are over, so such a
 * team is not stranded with a spot open.
 *
 * A season with a team that could not be given its turn keeps its holds,
 * and its waiting teams their money, and the next run tries again. Each
 * season is released on its own, so one failing leaves the rest to go ahead.
 */
export async function releaseHeldSpots(
	firestore: Firestore,
	now: Date
): Promise<ReleaseResult> {
	const result: ReleaseResult = { seasonsReleased: [], failures: [] }

	// Seasons are few, so they are filtered here rather than by a query.
	const seasonsSnap = await firestore.collection(Collections.SEASONS).get()

	for (const seasonDoc of seasonsSnap.docs) {
		try {
			if (!holdsDue(seasonDoc.data() as SeasonDocument, now)) continue

			const failed = await giveWaitingTeamsTheirTurn(firestore, seasonDoc, now)
			if (failed) {
				result.failures.push({ seasonId: seasonDoc.id, ...failed })
				continue
			}

			await seasonDoc.ref.update({
				heldSpotsReleasedAt: FieldValue.serverTimestamp(),
			})
			result.seasonsReleased.push(seasonDoc.id)
			logger.info('Held spots released', { seasonId: seasonDoc.id })

			// Anyone who started waiting while the first turn ran.
			const late = await giveWaitingTeamsTheirTurn(firestore, seasonDoc, now)
			if (late) result.failures.push({ seasonId: seasonDoc.id, ...late })
		} catch (error) {
			result.failures.push({
				seasonId: seasonDoc.id,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
		}
	}

	return result
}
