/**
 * The clock-driven half of settlement.
 *
 * Triggers settle a team when something happens to it — it registers, the
 * twelfth team registers, a payment lands, a payer leaves. One outcome
 * happens because time passes instead, with no write to trigger on:
 * **registration closes**, and every team still unregistered is refunded.
 *
 * That is just settlement, run on a schedule: `settleTeamSeason` already
 * decides from the current time what a team's money should be doing. So the
 * sweep only has to find the teams settlement might act on, by looking in
 * their ledgers, and settle each one. It also catches anything a trigger
 * left undone after exhausting its retries.
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
	type TeamContributionDocument,
} from '../types.js'
import { CONTRIBUTIONS_SUBCOLLECTION } from '../shared/contributions.js'
import { canonicalTeamIdFromTeamSeasonDoc } from '../shared/database.js'
import { settleTeamSeason } from './teamSettlementService.js'
import { queueTeamMissedOutEmails } from '../email/teamRegistrationEmails.js'

export interface TeamWithMoney {
	teamId: string
	seasonId: string
}

type TeamSeasonVisit = TeamWithMoney & {
	registered: boolean
	/** The season's team fee. */
	totalCents: number
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
				totalCents: (seasonDoc.data() as SeasonDocument)
					.teamRegistrationTotalCents as number,
				contributions: teamSeasonDoc.ref.collection(
					CONTRIBUTIONS_SUBCOLLECTION
				),
			})
		}
	}
	return visits
}

async function holdsPaidMoney(
	contributions: FirebaseFirestore.CollectionReference
): Promise<boolean> {
	const status: ContributionStatus = 'paid'
	const snap = await contributions.where('status', '==', status).limit(1).get()
	return !snap.empty
}

/**
 * The teams time can change anything for: unregistered teams holding money,
 * which are refunded if registration closes without them; and registered
 * teams still holding more than their fee, whose refund of the excess
 * failed past the triggers' own retries. A registered team's money is
 * otherwise settled when it registers and whenever a payment lands on it.
 */
async function findTeamsToSettle(
	firestore: Firestore
): Promise<TeamWithMoney[]> {
	const teams: TeamWithMoney[] = []
	for (const visit of await teamSeasonsOnTeamPayments(firestore)) {
		const settle = visit.registered
			? (await paidTotalCents(visit.contributions)) > visit.totalCents
			: await holdsPaidMoney(visit.contributions)
		if (settle) teams.push({ teamId: visit.teamId, seasonId: visit.seasonId })
	}
	return teams
}

/** What a team holds, in cents. */
async function paidTotalCents(
	contributions: FirebaseFirestore.CollectionReference
): Promise<number> {
	const status: ContributionStatus = 'paid'
	const snap = await contributions.where('status', '==', status).get()
	return snap.docs.reduce(
		(sum, doc) => sum + (doc.data() as TeamContributionDocument).amountCents,
		0
	)
}

/**
 * Every team holding money, which is what the reconciliation checks
 * against Stripe.
 */
export async function findTeamsWithLiveMoney(
	firestore: Firestore
): Promise<TeamWithMoney[]> {
	const teams: TeamWithMoney[] = []
	for (const visit of await teamSeasonsOnTeamPayments(firestore)) {
		if (await holdsPaidMoney(visit.contributions)) {
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
 * Settles every unregistered team holding money, as of `now`.
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
				// A team refunded because it is out is told so. The lock tells
				// teams that miss a full season; this reaches those left when
				// registration closes. Keyed per team, so nobody hears twice.
				if (outcome.outCause) {
					await queueTeamMissedOutEmails(firestore, {
						teamId,
						seasonId,
						reason: outcome.outCause,
						refunding: true,
					})
				}
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
