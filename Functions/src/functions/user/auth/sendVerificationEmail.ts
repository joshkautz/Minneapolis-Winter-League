/**
 * Send verification email callable function
 *
 * Emails the signed-in player a link to confirm their address, from the
 * league through the outbox rather than from Firebase (see
 * `email/accountEmails.ts`). `createPlayer` sends the first one at sign-up;
 * this is the "send it again" on the profile.
 *
 * Security validations:
 * - Caller must be signed in; an unverified email is the point, so it is
 *   allowed
 * - The link is for the caller's own account and goes to its own address
 * - At most one email per account every two minutes
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { validateBasicAuthentication } from '../../../shared/auth.js'
import { rethrowAsHttpsError } from '../../../shared/errors.js'
import { queueAccountEmail } from '../../../email/accountEmails.js'

export interface SendVerificationEmailResponse {
	/** False when the address was already confirmed: nothing to send. */
	alreadyVerified: boolean
	/** False when one went out in the last two minutes. */
	sent: boolean
}

export const sendVerificationEmail = onCall(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<SendVerificationEmailResponse> => {
		validateBasicAuthentication(request.auth)
		const uid = request.auth.uid

		const user = await getAuth().getUser(uid)
		if (!user.email) {
			throw new HttpsError(
				'failed-precondition',
				'Your account has no email address to confirm.'
			)
		}
		if (user.emailVerified) return { alreadyVerified: true, sent: false }

		try {
			const sent = await queueAccountEmail(
				getFirestore(),
				'emailVerification',
				{
					uid,
					email: user.email,
				}
			)
			logger.info('Verification email requested', { uid, sent })
			return { alreadyVerified: false, sent }
		} catch (error) {
			rethrowAsHttpsError(
				error,
				'The confirmation email could not be sent. Please try again.',
				{ uid }
			)
		}
	}
)
