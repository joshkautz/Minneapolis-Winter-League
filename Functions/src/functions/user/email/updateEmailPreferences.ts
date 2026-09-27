/**
 * Update email preferences callable function
 *
 * Turns kinds of email on or off: unsubscribing, unsubscribing from
 * everything, and resubscribing all come through here.
 *
 * Security validations:
 * - A link from the player's email (player id and matching token), or the
 *   player signed in as themselves; no sign-in needed with a link, as
 *   CAN-SPAM requires
 * - Only the categories a player may turn off, as booleans; account email
 *   (sign-in, receipts) cannot be turned off
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import {
	resolvePreferenceAccess,
	type PreferenceLink,
} from '../../../email/preferenceAccess.js'
import {
	isOptionalCategory,
	maskEmail,
	savePreferences,
	type EmailPreferences,
} from '../../../email/unsubscribe.js'
import type { EmailPreferencesResponse } from './getEmailPreferences.js'

interface UpdateEmailPreferencesRequest extends PreferenceLink {
	preferences: Partial<EmailPreferences>
}

export const updateEmailPreferences = onCall<UpdateEmailPreferencesRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<EmailPreferencesResponse> => {
		const changes = request.data?.preferences
		if (
			!changes ||
			typeof changes !== 'object' ||
			Array.isArray(changes) ||
			Object.keys(changes).length === 0
		) {
			throw new HttpsError('invalid-argument', 'Choose which emails to change.')
		}
		for (const [category, value] of Object.entries(changes)) {
			if (!isOptionalCategory(category)) {
				throw new HttpsError(
					'invalid-argument',
					category === 'account'
						? 'Account emails, like password resets, cannot be turned off.'
						: `"${category}" is not a kind of email.`
				)
			}
			if (typeof value !== 'boolean') {
				throw new HttpsError(
					'invalid-argument',
					'Each preference must be on or off.'
				)
			}
		}

		const firestore = getFirestore()
		const { playerId, contact } = await resolvePreferenceAccess(
			firestore,
			request.auth,
			request.data
		)
		const preferences = await savePreferences(firestore, playerId, changes)
		logger.info('Email preferences updated', { playerId, changes })
		return { email: maskEmail(contact.email), preferences }
	}
)
