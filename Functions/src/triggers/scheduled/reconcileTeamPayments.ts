/**
 * Daily reconciliation of team payments with Stripe
 *
 * Finds holds in Stripe the ledger does not have, and ledger entries Stripe
 * disagrees with, and repairs both. Anything it finds means an event was
 * lost somewhere, so each is logged as an error for a person to look into.
 * See services/teamPaymentsReconciliation.ts.
 *
 * Runs in the small hours, when nobody is registering.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'
import { createStripeClient } from '../../shared/stripe.js'
import { reconcileTeamPayments } from '../../services/teamPaymentsReconciliation.js'

export const reconcileTeamPaymentsDaily = onSchedule(
	{
		schedule: 'every day 04:00',
		timeZone: FIREBASE_CONFIG.TIME_ZONE,
		region: FIREBASE_CONFIG.REGION,
		secrets: ['STRIPE_SECRET_KEY'],
		timeoutSeconds: 540,
		maxInstances: 1,
	},
	async (event) => {
		if (await isMigrationInProgress(getFirestore())) {
			logger.info(
				'Skipping reconcileTeamPaymentsDaily — migration in progress',
				{
					scheduleTime: event.scheduleTime,
				}
			)
			return
		}

		const report = await reconcileTeamPayments({ stripe: createStripeClient() })

		if (report.failures.length > 0) {
			logger.error('Reconciliation could not check some payments', {
				failures: report.failures,
			})
			throw new Error(
				`Reconciliation failed for ${report.failures.length} payment(s)`
			)
		}
	}
)
