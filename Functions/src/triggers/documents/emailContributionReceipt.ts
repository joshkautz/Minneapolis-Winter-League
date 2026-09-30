/**
 * Team payment receipts
 *
 * Emails the payer a receipt for each payment into, and each refund out of,
 * a team's contribution ledger; see email/receipts.ts. Separate from the
 * registration trigger on the same documents, so a failed email never holds
 * up a registration, nor a retried registration send a second receipt.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { queueContributionReceipt } from '../../email/receipts.js'
import { createStripeClient } from '../../shared/stripe.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'
import type { TeamContributionDocument } from '../../types.js'

export const emailContributionReceipt = onDocumentWritten(
	{
		document:
			'teams/{teamId}/teamSeasons/{seasonId}/contributions/{paymentIntentId}',
		region: FIREBASE_CONFIG.REGION,
		// A lost run is a receipt never sent. The receipt's stable id makes a
		// retry after it was queued a no-op.
		retry: true,
		secrets: ['STRIPE_SECRET_KEY'],
	},
	async (event) => {
		const { teamId, seasonId, paymentIntentId } = event.params
		const firestore = getFirestore()

		if (await isMigrationInProgress(firestore)) {
			logger.info('Skipping emailContributionReceipt — migration in progress', {
				eventId: event.id,
				teamId,
				seasonId,
				paymentIntentId,
			})
			return
		}

		const before = event.data?.before.data() as
			TeamContributionDocument | undefined
		const after = event.data?.after.data() as
			TeamContributionDocument | undefined

		try {
			const outcome = await queueContributionReceipt(
				firestore,
				createStripeClient(),
				{ teamId, seasonId, paymentIntentId, before, after }
			)
			if (outcome !== 'none') {
				logger.info('Contribution receipt', {
					teamId,
					seasonId,
					paymentIntentId,
					outcome,
				})
			}
		} catch (error) {
			// Rethrown so the platform retries: Stripe or Firestore may be
			// briefly unavailable, and the receipt is keyed so none doubles.
			logger.error('Contribution receipt not queued', {
				teamId,
				seasonId,
				paymentIntentId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw error
		}
	}
)
