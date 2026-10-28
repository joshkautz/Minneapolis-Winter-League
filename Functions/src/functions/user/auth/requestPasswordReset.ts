/**
 * Request password reset callable function
 *
 * Emails a link to choose a new password, from the league through the
 * outbox rather than from Firebase (see `email/accountEmails.ts`). Called
 * from the sign-in page, so by someone who is signed out.
 *
 * Security validations:
 * - Needs no sign-in: whoever forgot their password cannot provide one
 * - The answer is the same whether or not an account uses the address, so
 *   it cannot be used to find out who has an account
 * - The link goes only to the account's own address, never one the caller
 *   chooses
 * - At most one email per account in ten minutes, counted from the last,
 *   so it cannot flood someone's inbox
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { rethrowAsHttpsError } from '../../../shared/errors.js'
import { queueAccountEmail } from '../../../email/accountEmails.js'

interface RequestPasswordResetRequest {
	email: string
}

/** Enough to refuse a typo, not a full validation: Auth has the last word. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Firebase Auth's code for an address no account uses. */
const USER_NOT_FOUND = 'auth/user-not-found'

export const requestPasswordReset = onCall<RequestPasswordResetRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<{ success: true }> => {
		const raw = request.data?.email
		const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
		if (!LOOKS_LIKE_EMAIL.test(email)) {
			throw new HttpsError('invalid-argument', 'Enter a valid email address.')
		}

		let user
		try {
			user = await getAuth().getUserByEmail(email)
		} catch (error) {
			if ((error as { code?: string }).code === USER_NOT_FOUND) {
				// Answered exactly as a real account is, on purpose.
				logger.info('Password reset requested for an unknown address')
				return { success: true }
			}
			rethrowAsHttpsError(
				error,
				'The reset email could not be sent. Please try again.'
			)
		}
		if (user.disabled || !user.email) return { success: true }

		try {
			const { sent } = await queueAccountEmail(
				getFirestore(),
				'passwordReset',
				{ uid: user.uid, email: user.email }
			)
			logger.info('Password reset requested', { uid: user.uid, sent })
			return { success: true }
		} catch (error) {
			rethrowAsHttpsError(
				error,
				'The reset email could not be sent. Please try again.',
				{ uid: user.uid }
			)
		}
	}
)
