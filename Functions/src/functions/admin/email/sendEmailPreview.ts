/**
 * Send an email preview callable function
 *
 * Queues one template, with its sample content, to each test recipient, so
 * a design can be checked in a real inbox before anyone else receives it.
 *
 * Security validations:
 * - Caller must be an admin
 * - The template must exist
 * - Email must be in test or live mode, with test recipients
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { mailDocument, mailRef } from '../../../email/outbox.js'
import { readEmailSettings } from '../../../email/settings.js'
import { TEMPLATES, isTemplateName } from '../../../email/templates.js'

interface SendEmailPreviewRequest {
	template: string
}

export const sendEmailPreview = onCall<SendEmailPreviewRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<{ queued: number }> => {
		const firestore = getFirestore()
		await validateAdminUser(request.auth, firestore)

		const { template } = request.data
		if (typeof template !== 'string' || !isTemplateName(template)) {
			throw new HttpsError(
				'invalid-argument',
				`Choose a template: ${Object.keys(TEMPLATES).join(', ')}.`
			)
		}
		const settings = await readEmailSettings(firestore)
		if (settings.mode === 'off' || settings.testRecipients.length === 0) {
			throw new HttpsError(
				'failed-precondition',
				'Email is off or has no test recipients. Set system/email first.'
			)
		}

		const batch = firestore.batch()
		for (const address of settings.testRecipients) {
			batch.create(
				mailRef(firestore),
				mailDocument({
					to: { address },
					template,
					props: TEMPLATES[template].sample as never,
				})
			)
		}
		await batch.commit()
		return { queued: settings.testRecipients.length }
	}
)
