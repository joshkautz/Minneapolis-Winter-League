/**
 * Checking Stripe and the contribution ledger against each other.
 *
 * Every mechanism that keeps the two in step is event-driven: the checkout
 * webhook records a hold, settlement records what it did, the PaymentIntent
 * webhooks record what happened elsewhere. An event that is lost — a webhook
 * that failed for longer than Stripe retries, a trigger that exhausted its
 * retries — leaves them disagreeing with nothing to notice.
 *
 * This notices, in both directions, and repairs what it safely can:
 *
 * - **A hold in Stripe that the ledger does not have** is taken in exactly
 *   as the checkout webhook would have: recorded against its team, or
 *   released if the team is gone. Either way the money stops being
 *   invisible. Finding one at all means an event was lost, so each is
 *   logged as an error.
 * - **A live ledger entry Stripe disagrees with** — a hold the bank let go,
 *   a refund issued in the Dashboard — is corrected to what Stripe says.
 *   This matters beyond bookkeeping: registration counts committed money,
 *   so a hold that has quietly lapsed would otherwise still count.
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

/** Stripe's search query for every live team contribution hold. */
export const LIVE_TEAM_HOLDS_QUERY = `status:'requires_capture' AND metadata['kind']:'${TEAM_CONTRIBUTION_KIND}'`

export interface ReconciliationReport {
	/** Holds Stripe had and the ledger did not, and what was done with each. */
	unrecordedHolds: { paymentIntentId: string; outcome: IntakeOutcome }[]
	/** Ledger entries corrected to match Stripe. */
	corrected: { teamId: string; seasonId: string; paymentIntentId: string }[]
	failures: { paymentIntentId: string; error: string }[]
}

export async function reconcileTeamPayments(options: {
	stripe: Stripe
	firestore?: Firestore
}): Promise<ReconciliationReport> {
	const firestore = options.firestore ?? getFirestore()
	const { stripe } = options
	const report: ReconciliationReport = {
		unrecordedHolds: [],
		corrected: [],
		failures: [],
	}

	// Stripe → ledger. Search is eventually consistent, by a minute or so,
	// which is irrelevant to a daily check; a hold created in that minute is
	// still in the ledger's hands via the webhook.
	for await (const found of stripe.paymentIntents.search({
		query: LIVE_TEAM_HOLDS_QUERY,
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
			// the hold's expiry.
			const paymentIntent = await stripe.paymentIntents.retrieve(found.id, {
				expand: ['latest_charge'],
			})
			const outcome = await recordContributionFromStripe(firestore, stripe, {
				paymentIntent,
				metadata: paymentIntent.metadata,
			})
			logger.error('Stripe held a team contribution the ledger did not have', {
				paymentIntentId: found.id,
				teamId,
				seasonId,
				outcome,
			})
			report.unrecordedHolds.push({ paymentIntentId: found.id, outcome })
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
			.where('status', 'in', ['authorized', 'captured'])
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
		unrecordedHolds: report.unrecordedHolds.length,
		corrected: report.corrected.length,
		failed: report.failures.length,
	})

	return report
}
