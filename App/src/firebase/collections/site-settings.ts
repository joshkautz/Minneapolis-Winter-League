/**
 * Site settings Firestore operations
 */

import { doc, type DocumentReference } from 'firebase/firestore'
import { firestore } from '../app'
import { Collections, SiteSettingsDocument } from '@/types'

/**
 * Document ID for theme settings
 */
export const THEME_SETTINGS_DOC_ID = 'theme'

/**
 * Gets the document reference for theme settings
 */
export const getSiteSettingsRef =
	(): DocumentReference<SiteSettingsDocument> => {
		return doc(
			firestore,
			Collections.SITE_SETTINGS,
			THEME_SETTINGS_DOC_ID
		) as DocumentReference<SiteSettingsDocument>
	}
