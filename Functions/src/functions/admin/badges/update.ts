/**
 * Update badge callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, BadgeDocument } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import {
	deleteStoredImage,
	parseImageUpload,
	storeImage,
} from '../../../shared/images.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { requireText, TEXT_RULES } from '../../../shared/textFields.js'

interface UpdateBadgeRequest {
	badgeId: string
	name?: string
	description?: string
	imageBlob?: string // Base64 encoded image
	imageContentType?: string // MIME type of the image
	removeImage?: boolean // Flag to remove existing image
}

interface UpdateBadgeResponse {
	success: true
	badgeId: string
	message: string
}

/**
 * Updates an existing badge with proper authorization
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - Badge must exist
 * - Fields are validated if provided
 */
export const updateBadge = onCall<UpdateBadgeRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<UpdateBadgeResponse> => {
		const { data, auth } = request

		const {
			badgeId,
			name,
			description,
			imageBlob,
			imageContentType,
			removeImage,
		} = data

		// Validate required fields
		if (!badgeId) {
			throw new HttpsError('invalid-argument', 'Badge ID is required')
		}

		// Validate at least one field is being updated
		if (
			name === undefined &&
			description === undefined &&
			!imageBlob &&
			!removeImage
		) {
			throw new HttpsError(
				'invalid-argument',
				'At least one field must be provided to update'
			)
		}

		if (name !== undefined && name !== null) {
			requireText(name, TEXT_RULES.badgeName)
		}

		if (description !== undefined && description !== null) {
			requireText(description, TEXT_RULES.badgeDescription)
		}

		const image = parseImageUpload(
			imageBlob,
			imageContentType,
			'The badge image'
		)

		try {
			const firestore = getFirestore()

			// Validate admin authentication and get validated user ID
			const userId = await validateAdminUser(auth, firestore)

			// Verify badge exists
			const badgeRef = firestore.collection(Collections.BADGES).doc(badgeId)
			const badgeDoc = await badgeRef.get()

			if (!badgeDoc.exists) {
				throw new HttpsError('not-found', 'Badge not found')
			}

			const existingBadge = badgeDoc.data() as BadgeDocument

			// Prepare update object
			const updates: Partial<
				Omit<BadgeDocument, 'updatedAt' | 'createdAt' | 'createdBy'>
			> & {
				updatedAt: FirebaseFirestore.FieldValue
			} = {
				updatedAt: FieldValue.serverTimestamp(),
			}

			if (name !== undefined && name !== null) {
				updates.name = name.trim()
			}

			if (description !== undefined && description !== null) {
				updates.description = description.trim()
			}

			// Store a new image under a fresh path before touching the badge,
			// so a failed upload leaves the badge as it was.
			if (removeImage) {
				updates.imageUrl = null
				updates.storagePath = null
			} else if (image) {
				const stored = await storeImage(
					`badges/${badgeId}-${crypto.randomUUID()}`,
					image,
					'The badge image'
				)
				updates.imageUrl = stored.url
				updates.storagePath = stored.storagePath
			}

			// Update badge document
			await badgeRef.update(updates)

			// The old image goes only once the badge no longer points to it.
			if (
				updates.storagePath !== undefined &&
				existingBadge.storagePath &&
				existingBadge.storagePath !== updates.storagePath
			) {
				await deleteStoredImage(existingBadge.storagePath)
			}

			logger.info('Badge updated successfully', {
				badgeId,
				updatedBy: userId,
				fieldsUpdated: Object.keys(updates).filter(
					(key) => key !== 'updatedAt'
				),
			})

			return {
				success: true,
				badgeId,
				message: 'Badge updated successfully',
			}
		} catch (error) {
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error updating badge:', {
				userId: auth?.uid,
				badgeId: data.badgeId,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				'The badge could not be saved. Please try again.'
			)
		}
	}
)
