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
 * sweep only has to find the teams whose money settlement might act on, by
 * looking in their ledgers, and settle each one.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import type Stripe from 'stripe'
import {
	Collections,
	TEAM_SEASONS_SUBCOLLECTION,
	type ContributionStatus,
	type SeasonDocument,
	type TeamSeasonDocument,
} from '../types.js'
import { CONTRIBUTIONS_SUBCOLLECTION } from '../shared/contributions.js'
import { canonicalTeamIdFromTeamSeasonDoc } from '../shared/database.js'
import { settleTeamSeason } from './teamSettlementService.js'

export interface TeamWithMoney {
	teamId: string
	seasonId: string
}

type TeamSeasonVisit = TeamWithMoney & {
	registered: boolean
	contributions: FirebaseFirestore.CollectionReference
}

/**
 * Every team-season in every season on team payments. Seasons are few, so
 * they are filtered in memory rather than queried by a field that would need
 * its own index.
 */
async function teamSeasonsOnTeamPayments(
	firestore: Firestore
): Promise<TeamSeasonVisit[]> {
	const seasonsSnap = await firestore.collection(Collections.SEASONS).get()
	const teamPaymentSeasons = seasonsSnap.docs.filter(
		(doc) =>
			typeof (doc.data() as SeasonDocument).teamRegistrationTotalCents ===
			'number'
	)

	const visits: TeamSeasonVisit[] = []
	for (const seasonDoc of teamPaymentSeasons) {
		const teamSeasonsSnap = await firestore
			.collectionGroup(TEAM_SEASONS_SUBCOLLECTION)
			.where('season', '==', seasonDoc.ref)
			.get()

		for (const teamSeasonDoc of teamSeasonsSnap.docs) {
			visits.push({
				teamId: canonicalTeamIdFromTeamSeasonDoc(
					teamSeasonDoc as FirebaseFirestore.QueryDocumentSnapshot<TeamSeasonDocument>
				),
				seasonId: seasonDoc.id,
				registered: (teamSeasonDoc.data() as TeamSeasonDocument).registered,
				contributions: teamSeasonDoc.ref.collection(
					CONTRIBUTIONS_SUBCOLLECTION
				),
			})
		}
	}
	return visits
}

async function hasContributionWithStatus(
	contributions: FirebaseFirestore.CollectionReference,
	statuses: ContributionStatus[]
): Promise<boolean> {
	const snap = await contributions
		.where('status', 'in', statuses)
		.limit(1)
		.get()
	return !snap.empty
}

/**
 * The teams settlement might have something to do for.
 *
 * Any team holding a live authorization, since a hold is what gets
 * captured, released or left to expire. And any unregistered team with
 * captured money, which the expiry net took and which has to be refunded if
 * the team misses out. A registered team whose money is all captured has
 * nothing left to settle, so past seasons cost a query per team and no more.
 */
export async function findTeamsToSettle(
	firestore: Firestore
): Promise<TeamWithMoney[]> {
	const teams: TeamWithMoney[] = []
	for (const visit of await teamSeasonsOnTeamPayments(firestore)) {
		const include =
			(await hasContributionWithStatus(visit.contributions, ['authorized'])) ||
			(!visit.registered &&
				(await hasContributionWithStatus(visit.contributions, ['captured'])))
		if (include) teams.push({ teamId: visit.teamId, seasonId: visit.seasonId })
	}
	return teams
}

/**
 * Every team holding money that is still live — held or captured — which is
 * what the reconciliation checks against Stripe.
 */
export async function findTeamsWithLiveMoney(
	firestore: Firestore
): Promise<TeamWithMoney[]> {
	const teams: TeamWithMoney[] = []
	for (const visit of await teamSeasonsOnTeamPayments(firestore)) {
		if (
			await hasContributionWithStatus(visit.contributions, [
				'authorized',
				'captured',
			])
		) {
			teams.push({ teamId: visit.teamId, seasonId: visit.seasonId })
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
	const teams = await findTeamsToSettle(firestore)

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
