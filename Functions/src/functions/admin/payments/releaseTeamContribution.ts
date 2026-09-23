/**
 * Release a single team contribution (Admin only)
 *
 * Cancels the contribution if it is still a hold, refunds it if it was
 * captured, and records who did it and why. For cases the settlement rules
 * do not cover — a dispute, a payer who left the team before it registered.
 *
 * Security validations:
 * - Caller must be an admin (player document's `admin` flag)
 * - Team, season and PaymentIntent ids must be non-empty strings
 * - A reason is required and bounded, because it is the audit trail
 * - Only a contribution that exists and still holds money can be released
 *
 * The team's registration is not touched; it is irreversible. Releasing
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
import { releaseContribution } from '../../../services/teamSettlementService.js'

interface ReleaseTeamContributionRequest {
	teamId: string
	seasonId: string
	paymentIntentId: string
	reason: string
}

interface ReleaseTeamContributionResponse {
	success: true
	status: 'canceled' | 'refunded'
}

const MAX_REASON_LENGTH = 500

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === 'string' && value.trim().length > 0

export const releaseTeamContribution = onCall<
	ReleaseTeamContributionRequest,
	Promise<ReleaseTeamContributionResponse>
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
			result = await releaseContribution(firestore, createStripeClient(), {
				teamId,
				seasonId,
				paymentIntentId,
			})
		} catch (error) {
			logger.error('Failed to release a team contribution', {
				adminId,
				teamId,
				seasonId,
				paymentIntentId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw new HttpsError('internal', 'Stripe could not release this payment')
		}

		switch (result.outcome) {
			case 'not-found':
				throw new HttpsError('not-found', 'No such contribution')
			case 'already-settled':
				throw new HttpsError(
					'failed-precondition',
					`This contribution is already ${result.status}`
				)
			case 'stripe-disagreed':
				throw new HttpsError(
					'failed-precondition',
					`Stripe reports this payment as ${result.stripeStatus}; the record ` +
						'has been corrected to match. Check it and try again.'
				)
			case 'released':
				break
		}

		// The audit trail. Written after the release, so a release that
		// failed leaves no claim that it happened.
		await teamContributionsCollection(firestore, teamId, seasonId)
			.doc(paymentIntentId)
			.update({
				releasedBy: firestore.collection(Collections.PLAYERS).doc(adminId),
				releaseReason: reason.trim(),
				releasedAt: FieldValue.serverTimestamp(),
			})

		logger.info('Released a team contribution', {
			adminId,
			teamId,
			seasonId,
			paymentIntentId,
			status: result.status,
		})

		return { success: true, status: result.status }
	}
)
