/**
 * Checking Stripe and the contribution ledger against each other.
 *
 * Every mechanism that keeps the two in step is event-driven: the checkout
 * webhook records a payment, settlement records what it refunded, the
 * refund webhook records what happened elsewhere. An event that is lost — a webhook
 * that failed for longer than Stripe retries, a trigger that exhausted its
 * retries — leaves them disagreeing with nothing to notice.
 *
 * This notices, in both directions, and repairs what it safely can:
 *
 * - **A payment in Stripe that the ledger does not have** is taken in
 *   exactly as the checkout webhook would have: recorded against its team,
 *   or refunded if the team is gone. Either way the money stops being
 *   invisible. Finding one at all means an event was lost, so each is
 *   logged as an error.
 * - **A ledger entry Stripe disagrees with** — a refund issued in the
 *   Dashboard, say — is corrected to what Stripe says. This matters beyond
 *   bookkeeping: registration counts paid money, so a payment refunded
 *   elsewhere would otherwise still count.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import type Stripe from 'stripe'
import type { TeamContributionDocument } from '../types.js'
import { teamContributionsCollection } from '../shared/contributions.js'
import { TEAM_CONTRIBUTION_KIND } from '../shared/stripe.js'
import { findTeamsWithLiveMoney } from './teamPaymentsSweep.js'
import {
	recordContributionFromStripe,
	type IntakeOutcome,
} from './teamContributionIntake.js'
import { reconcileContribution } from './teamSettlementService.js'
import { contributionStateFromPaymentIntent } from '../shared/settlement.js'

/**
 * How far back to look for payments the webhook missed. Longer than any
 * registration window, so a payment is checked on every daily run for as
 * long as it could matter, without the search growing forever.
 */
export const RECONCILIATION_LOOKBACK_DAYS = 45

const DAY_SECONDS = 24 * 60 * 60

/** Stripe's search query for recent team contribution payments. */
export const recentTeamPaymentsQuery = (now: Date): string =>
	`status:'succeeded' AND metadata['kind']:'${TEAM_CONTRIBUTION_KIND}' AND created>${
		Math.floor(now.getTime() / 1000) -
		RECONCILIATION_LOOKBACK_DAYS * DAY_SECONDS
	}`

export interface ReconciliationReport {
	/** Payments Stripe had and the ledger did not, and what was done with each. */
	unrecordedPayments: { paymentIntentId: string; outcome: IntakeOutcome }[]
	/** Ledger entries corrected to match Stripe. */
	corrected: { teamId: string; seasonId: string; paymentIntentId: string }[]
	failures: { paymentIntentId: string; error: string }[]
}

export async function reconcileTeamPayments(options: {
	stripe: Stripe
	firestore?: Firestore
	now?: Date
}): Promise<ReconciliationReport> {
	const firestore = options.firestore ?? getFirestore()
	const { stripe } = options
	const now = options.now ?? new Date()
	const report: ReconciliationReport = {
		unrecordedPayments: [],
		corrected: [],
		failures: [],
	}

	// Stripe → ledger. Search is eventually consistent, by a minute or so,
	// which is irrelevant to a daily check; a payment made in that minute is
	// still in the ledger's hands via the webhook.
	for await (const found of stripe.paymentIntents.search({
		query: recentTeamPaymentsQuery(now),
		limit: 100,
	})) {
		try {
			const { teamId, seasonId } = found.metadata ?? {}
			if (teamId && seasonId) {
				const entry = await teamContributionsCollection(
					firestore,
					teamId,
					seasonId
				)
					.doc(found.id)
					.get()
				if (entry.exists) continue
			}

			// Retrieved individually for the expanded charge, which carries
			// what has been refunded.
			const paymentIntent = await stripe.paymentIntents.retrieve(found.id, {
				expand: ['latest_charge'],
			})
			// Already refunded in full, most often because it could not be
			// attributed: nothing is missing, and nothing to take in.
			if (
				contributionStateFromPaymentIntent(paymentIntent)?.status !== 'paid'
			) {
				continue
			}
			const outcome = await recordContributionFromStripe(firestore, stripe, {
				paymentIntent,
				metadata: paymentIntent.metadata,
			})
			logger.error('Stripe had a team payment the ledger did not', {
				paymentIntentId: found.id,
				teamId,
				seasonId,
				outcome,
			})
			report.unrecordedPayments.push({ paymentIntentId: found.id, outcome })
		} catch (error) {
			report.failures.push({
				paymentIntentId: found.id,
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	// Ledger → Stripe.
	for (const { teamId, seasonId } of await findTeamsWithLiveMoney(firestore)) {
		const live = await teamContributionsCollection(firestore, teamId, seasonId)
			.where('status', '==', 'paid')
			.get()

		for (const doc of live.docs) {
			const contribution = doc.data() as TeamContributionDocument
			try {
				const paymentIntent = await stripe.paymentIntents.retrieve(doc.id, {
					expand: ['latest_charge'],
				})
				const outcome = await reconcileContribution(firestore, {
					teamId,
					seasonId,
					paymentIntent,
				})
				if (outcome === 'updated') {
					logger.warn('Corrected a team contribution to match Stripe', {
						teamId,
						seasonId,
						paymentIntentId: doc.id,
						was: contribution.status,
						stripeStatus: paymentIntent.status,
					})
					report.corrected.push({ teamId, seasonId, paymentIntentId: doc.id })
				}
			} catch (error) {
				report.failures.push({
					paymentIntentId: doc.id,
					error: error instanceof Error ? error.message : String(error),
				})
			}
		}
	}

	logger.info('Reconciled team payments with Stripe', {
		unrecordedPayments: report.unrecordedPayments.length,
		corrected: report.corrected.length,
		failed: report.failures.length,
	})

	return report
}
