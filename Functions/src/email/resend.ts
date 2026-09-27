/** The one place that talks to Resend. */

import { Resend } from 'resend'
import { EMAIL_CONFIG } from '../config/constants.js'
import type { SendEmail } from './sender.js'

/**
 * Failures a later attempt can get past. Anything else — a malformed
 * address, a bad key — fails the same way every time.
 */
const RETRYABLE = new Set([
	'rate_limit_exceeded',
	'daily_quota_exceeded',
	'monthly_quota_exceeded',
	'concurrent_idempotent_requests',
	'application_error',
	'internal_server_error',
])

export function resendSender(apiKey: string): SendEmail {
	const resend = new Resend(apiKey)
	return async (email, idempotencyKey) => {
		try {
			const { data, error } = await resend.emails.send(
				{
					from: EMAIL_CONFIG.FROM,
					replyTo: EMAIL_CONFIG.REPLY_TO,
					to: email.to,
					subject: email.subject,
					html: email.html,
					text: email.text,
					headers: email.headers,
					tags: email.tags,
				},
				{ idempotencyKey }
			)
			if (data) return { ok: true, id: data.id }
			return {
				ok: false,
				retryable: RETRYABLE.has(error.name) || error.statusCode === null,
				message: `${error.name}: ${error.message}`,
			}
		} catch (error) {
			// A network failure never reached Resend: worth another try.
			return {
				ok: false,
				retryable: true,
				message: error instanceof Error ? error.message : String(error),
			}
		}
	}
}
