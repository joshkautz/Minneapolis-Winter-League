/**
 * The clock-driven half of settlement.
 *
 * Triggers settle a team when something happens to it — it registers, the
 * twelfth team registers, a hold lands. Two outcomes happen because time
 * passes instead, with no write to trigger on:
 *
 * - **Registration closes.** Every team still unregistered is released.
 * - **A hold nears expiry.** An authorization lasts about seven days and a
 *   registration window runs for weeks, so a hold on a team still in the
 *   running is captured in its last day rather than allowed to lapse.
 *
 * Both are just settlement, run on a schedule: `settleTeamSeason` already
 * decides from the current time what a team's money should be doing. So the
 * sweep only has to find the teams holding money and settle each one.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import type Stripe from 'stripe'
import {
	Collections,
	TEAM_SEASONS_SUBCOLLECTION,
	type SeasonDocument,
	type TeamSeasonDocument,
} from '../types.js'
import { canonicalTeamIdFromTeamSeasonDoc } from '../shared/database.js'
import { settleTeamSeason } from './teamSettlementService.js'

export interface TeamWithMoney {
	teamId: string
	seasonId: string
}

/**
 * Every team-season, in every season on team payments, that holds money.
 *
 * Seasons are few, so they are filtered in memory rather than queried by a
 * field that would need its own index. A team-season with no contributions
 * has neither total and is skipped; a registered team that is fully
 * captured is included, because a late hold or an excess capture may still
 * need settling, and settling it when there is nothing to do costs three
 * reads.
 */
export async function findTeamsWithMoney(
	firestore: Firestore
): Promise<TeamWithMoney[]> {
	const seasonsSnap = await firestore.collection(Collections.SEASONS).get()
	const teamPaymentSeasons = seasonsSnap.docs.filter(
		(doc) =>
			typeof (doc.data() as SeasonDocument).teamRegistrationTotalCents ===
			'number'
	)

	const teams: TeamWithMoney[] = []
	for (const seasonDoc of teamPaymentSeasons) {
		const teamSeasonsSnap = await firestore
			.collectionGroup(TEAM_SEASONS_SUBCOLLECTION)
			.where('season', '==', seasonDoc.ref)
			.get()

		for (const teamSeasonDoc of teamSeasonsSnap.docs) {
			const data = teamSeasonDoc.data() as TeamSeasonDocument
			if ((data.authorizedCents ?? 0) > 0 || (data.capturedCents ?? 0) > 0) {
				teams.push({
					teamId: canonicalTeamIdFromTeamSeasonDoc(
						teamSeasonDoc as FirebaseFirestore.QueryDocumentSnapshot<TeamSeasonDocument>
					),
					seasonId: seasonDoc.id,
				})
			}
		}
	}
	return teams
}

export interface SweepResult {
	teamsChecked: number
	teamsActedOn: number
	failures: { teamId: string; seasonId: string; error: string }[]
}

/**
 * Settles every team holding money, as of `now`.
 *
 * One team's failure does not stop the others. The caller decides what to
 * do with the failures; the scheduled function reports them and lets the
 * next run try again.
 */
export async function sweepTeamPayments(
	options: { now?: Date; stripe?: Stripe; firestore?: Firestore } = {}
): Promise<SweepResult> {
	const firestore = options.firestore ?? getFirestore()
	const teams = await findTeamsWithMoney(firestore)

	let teamsActedOn = 0
	const failures: SweepResult['failures'] = []

	for (const { teamId, seasonId } of teams) {
		try {
			const outcome = await settleTeamSeason(teamId, seasonId, {
				...options,
				firestore,
			})
			if (outcome.outcome === 'settled' && outcome.actionsApplied > 0) {
				teamsActedOn += 1
			}
		} catch (error) {
			failures.push({
				teamId,
				seasonId,
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	logger.info('Swept team payments', {
		teamsChecked: teams.length,
		teamsActedOn,
		failed: failures.length,
	})

	return { teamsChecked: teams.length, teamsActedOn, failures }
}
