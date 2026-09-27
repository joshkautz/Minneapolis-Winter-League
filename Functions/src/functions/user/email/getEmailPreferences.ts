/**
 * Get email preferences callable function
 *
 * Returns which emails a player receives, for the preferences page and the
 * profile, with their address masked.
 *
 * Security validations:
 * - A link from the player's email (player id and matching token), or the
 *   player signed in as themselves; no sign-in needed with a link, as
 *   CAN-SPAM requires
 * - Only preferences and a masked address are returned
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import {
	resolvePreferenceAccess,
	type PreferenceLink,
} from '../../../email/preferenceAccess.js'
import {
	maskEmail,
	preferencesOf,
	type EmailPreferences,
} from '../../../email/unsubscribe.js'

export interface EmailPreferencesResponse {
	email: string
	preferences: EmailPreferences
}

export const getEmailPreferences = onCall<PreferenceLink>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<EmailPreferencesResponse> => {
		const { contact } = await resolvePreferenceAccess(
			getFirestore(),
			request.auth,
			request.data ?? {}
		)
		return {
			email: maskEmail(contact.email),
			preferences: preferencesOf(contact),
		}
	}
)
