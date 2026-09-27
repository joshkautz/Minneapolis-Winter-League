/**
 * Sends each email queued in `mail/{id}`. See email/sender.ts.
 *
 * Retried on failure, with backoff, for failures that may pass (rate
 * limits, Resend outages); the send is idempotent. A handful of instances at
 * once keeps a large announcement under Resend's rate limit rather than
 * racing into it.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { getResendApiKey } from '../../config/environment.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'
import { deliverQueuedEmail } from '../../email/sender.js'
import { resendSender } from '../../email/resend.js'

export const sendQueuedEmail = onDocumentCreated(
	{
		document: 'mail/{mailId}',
		region: FIREBASE_CONFIG.REGION,
		secrets: ['RESEND_API_KEY'],
		retry: true,
		maxInstances: 3,
		concurrency: 1,
	},
	async (event) => {
		const firestore = getFirestore()
		if (await isMigrationInProgress(firestore)) {
			logger.info('Skipping sendQueuedEmail — migration in progress', {
				mailId: event.params.mailId,
			})
			return
		}
		const status = await deliverQueuedEmail(
			firestore,
			event.params.mailId,
			resendSender(getResendApiKey())
		)
		logger.info('Queued email handled', { mailId: event.params.mailId, status })
	}
)
