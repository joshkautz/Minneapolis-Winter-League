/**
 * Update site settings callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, ThemeVariant, THEME_VARIANTS } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface UpdateSiteSettingsRequest {
	themeVariant: ThemeVariant
}

interface UpdateSiteSettingsResponse {
	success: true
	themeVariant: ThemeVariant
	message: string
}
const THEME_SETTINGS_DOC_ID = 'theme'

/**
 * Updates site-wide settings
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - Theme variant must be a valid value
 */
export const updateSiteSettings = onCall<UpdateSiteSettingsRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<UpdateSiteSettingsResponse> => {
		const { data, auth } = request

		const { themeVariant } = data

		// Validate required fields
		if (!themeVariant) {
			throw new HttpsError('invalid-argument', 'Theme variant is required')
		}

		// Validate theme variant value
		if (!THEME_VARIANTS.includes(themeVariant)) {
			throw new HttpsError(
				'invalid-argument',
				`Invalid theme variant. Must be one of: ${THEME_VARIANTS.join(', ')}`
			)
		}

		try {
			const firestore = getFirestore()

			// Validate admin authentication
			await validateAdminUser(auth, firestore)

			// Update site settings document
			const settingsRef = firestore
				.collection(Collections.SITE_SETTINGS)
				.doc(THEME_SETTINGS_DOC_ID)

			await settingsRef.set({ themeVariant }, { merge: true })

			logger.info('Site settings updated successfully', {
				themeVariant,
				updatedBy: auth!.uid,
			})

			return {
				success: true,
				themeVariant,
				message: `Theme variant updated to ${themeVariant}`,
			}
		} catch (error) {
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error updating site settings:', {
				userId: auth?.uid,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				`Failed to update site settings: ${errorMessage}`
			)
		}
	}
)
