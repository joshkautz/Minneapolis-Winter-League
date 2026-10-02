/**
 * Resend webhook: delivery reports for the email the league sends, served
 * at mplswinterleague.com/resendWebhook (a Hosting rewrite in firebase.json).
 *
 * Security:
 * - Every request is checked against RESEND_WEBHOOK_SECRET, the endpoint's
 *   signing secret (Standard Webhooks, as Resend signs them), before it is
 *   read; a missing or wrong signature, or one older than five minutes, is
 *   refused with 400 and changes nothing
 * - A report can only change the mail document whose providerId it names,
 *   and the contact of that mail's recipient
 *
 * Resend retries anything but a 2xx, so a failure to record answers 500,
 * and an event for an email the league did not send answers 200.
 */

import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Resend } from 'resend'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { getSecret } from '../../config/environment.js'
import { deliveryReportOf, recordDelivery } from '../../email/delivery.js'

/**
 * The SDK's constructor refuses to run without an API key, though checking
 * a signature never uses one. This function is not given the real sending
 * key, which it has no need for.
 */
const VERIFY_ONLY_KEY = 're_webhook_verification_only'

const header = (value: string | string[] | undefined): string =>
	Array.isArray(value) ? (value[0] ?? '') : (value ?? '')

export const resendWebhook = onRequest(
	{
		region: FIREBASE_CONFIG.REGION,
		secrets: ['RESEND_WEBHOOK_SECRET'],
		invoker: 'public',
	},
	async (request, response) => {
		if (request.method !== 'POST') {
			response.status(405).set('Allow', 'POST').send('Method not allowed')
			return
		}

		let event
		try {
			event = new Resend(VERIFY_ONLY_KEY).webhooks.verify({
				payload: request.rawBody.toString('utf8'),
				headers: {
					id: header(request.headers['svix-id']),
					timestamp: header(request.headers['svix-timestamp']),
					signature: header(request.headers['svix-signature']),
				},
				webhookSecret: getSecret('RESEND_WEBHOOK_SECRET'),
			})
		} catch (error) {
			logger.warn('Resend webhook refused: bad signature', {
				error: error instanceof Error ? error.message : String(error),
			})
			response.status(400).send('Invalid signature')
			return
		}

		const report = deliveryReportOf(event)
		if (!report) {
			response.status(200).send('Ignored')
			return
		}
		try {
			const outcome = await recordDelivery(getFirestore(), report)
			logger.info('Resend delivery report', {
				type: event.type,
				emailId: report.emailId,
				outcome,
			})
			response.status(200).send(outcome)
		} catch (error) {
			logger.error('Resend delivery report not recorded', {
				type: event.type,
				emailId: report.emailId,
				error,
			})
			response.status(500).send('Not recorded')
		}
	}
)
