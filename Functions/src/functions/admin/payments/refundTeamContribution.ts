/**
 * Refund a single team contribution (Admin only)
 *
 * Refunds the payment in full and records who did it and why. For cases the
 * settlement rules do not cover — a dispute, a test payment, a payer who
 * should not have been charged.
 *
 * Security validations:
 * - Caller must be an admin (player document's `admin` flag)
 * - Team, season and PaymentIntent ids must be non-empty strings
 * - A reason is required and bounded, because it is the audit trail
 * - Only a contribution that exists and is still paid can be refunded
 *
 * The team's registration is not touched; it is irreversible. Refunding
 * money from a registered team leaves it short of its total, which
 * settlement then reports.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { Collections } from '../../../types.js'
import { teamContributionsCollection } from '../../../shared/contributions.js'
import { createStripeClient } from '../../../shared/stripe.js'
import { refundContribution } from '../../../services/teamSettlementService.js'

interface RefundTeamContributionRequest {
	teamId: string
	seasonId: string
	paymentIntentId: string
	reason: string
}

interface RefundTeamContributionResponse {
	success: true
}

const MAX_REASON_LENGTH = 500

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === 'string' && value.trim().length > 0

export const refundTeamContribution = onCall<
	RefundTeamContributionRequest,
	Promise<RefundTeamContributionResponse>
>(
	{ region: FIREBASE_CONFIG.REGION, secrets: ['STRIPE_SECRET_KEY'] },
	async (request) => {
		const firestore = getFirestore()
		const adminId = await validateAdminUser(request.auth, firestore)

		const { teamId, seasonId, paymentIntentId, reason } = request.data ?? {}
		if (
			!isNonEmptyString(teamId) ||
			!isNonEmptyString(seasonId) ||
			!isNonEmptyString(paymentIntentId)
		) {
			throw new HttpsError(
				'invalid-argument',
				'Team, season and payment ids are required'
			)
		}
		if (!isNonEmptyString(reason) || reason.trim().length > MAX_REASON_LENGTH) {
			throw new HttpsError(
				'invalid-argument',
				`A reason of at most ${MAX_REASON_LENGTH} characters is required`
			)
		}

		let result
		try {
			result = await refundContribution(firestore, createStripeClient(), {
				teamId,
				seasonId,
				paymentIntentId,
			})
		} catch (error) {
			logger.error('Failed to refund a team contribution', {
				adminId,
				teamId,
				seasonId,
				paymentIntentId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw new HttpsError('internal', 'Stripe could not refund this payment')
		}

		switch (result.outcome) {
			case 'not-found':
				throw new HttpsError('not-found', 'No such contribution')
			case 'already-refunded':
				throw new HttpsError(
					'failed-precondition',
					'This contribution has already been refunded'
				)
			case 'stripe-disagreed':
				throw new HttpsError(
					'failed-precondition',
					`Stripe reports this payment as ${result.stripeStatus}; the record ` +
						'has been corrected to match. Check it and try again.'
				)
			case 'refunded':
				break
		}

		// The audit trail. Written after the refund, so a refund that failed
		// leaves no claim that it happened.
		await teamContributionsCollection(firestore, teamId, seasonId)
			.doc(paymentIntentId)
			.update({
				refundedBy: firestore.collection(Collections.PLAYERS).doc(adminId),
				refundReason: reason.trim(),
				refundedAt: FieldValue.serverTimestamp(),
			})

		logger.info('Refunded a team contribution', {
			adminId,
			teamId,
			seasonId,
			paymentIntentId,
		})

		return { success: true }
	}
)
