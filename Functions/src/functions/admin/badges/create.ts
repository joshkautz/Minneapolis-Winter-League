/**
 * Create badge callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, BadgeDocument } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { parseImageUpload, storeImage } from '../../../shared/images.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { requireText, TEXT_RULES } from '../../../shared/textFields.js'

interface CreateBadgeRequest {
	name: string
	description: string
	imageBlob?: string // Base64 encoded image
	imageContentType?: string // MIME type of the image
}

interface CreateBadgeResponse {
	success: true
	badgeId: string
	message: string
}

/**
 * Creates a new badge with proper authorization
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - Name and description are required and validated
 * - Image must be a valid image type if provided
 */
export const createBadge = onCall<CreateBadgeRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<CreateBadgeResponse> => {
		const { data, auth } = request

		const { name, description, imageBlob, imageContentType } = data

		// Validate required fields
		if (!name || !description) {
			throw new HttpsError(
				'invalid-argument',
				'Name and description are required'
			)
		}

		requireText(name, TEXT_RULES.badgeName)

		requireText(description, TEXT_RULES.badgeDescription)

		const image = parseImageUpload(
			imageBlob,
			imageContentType,
			'The badge image'
		)

		try {
			const firestore = getFirestore()

			// Validate admin authentication and get validated user ID
			const userId = await validateAdminUser(auth, firestore)

			// Get user reference
			const userRef = firestore.collection(Collections.PLAYERS).doc(userId)

			// Create badge reference with auto-generated ID
			const badgeRef = firestore.collection(Collections.BADGES).doc()
			const badgeId = badgeRef.id

			const now = FieldValue.serverTimestamp()

			let imageUrl: string | null = null
			let storagePath: string | null = null

			// Handle image upload if provided
			if (image) {
				const stored = await storeImage(
					`badges/${badgeId}-${crypto.randomUUID()}`,
					image,
					'The badge image'
				)
				imageUrl = stored.url
				storagePath = stored.storagePath
			}

			// Create badge document
			const badgeDocument: Omit<
				BadgeDocument,
				'createdAt' | 'updatedAt' | 'stats'
			> & {
				createdAt: FirebaseFirestore.FieldValue
				updatedAt: FirebaseFirestore.FieldValue
				stats: {
					totalTeamsAwarded: number
					lastUpdated: FirebaseFirestore.FieldValue
				}
			} = {
				badgeId,
				name: name.trim(),
				description: description.trim(),
				imageUrl,
				storagePath,
				createdBy: userRef,
				createdAt: now,
				updatedAt: now,
				stats: {
					totalTeamsAwarded: 0,
					lastUpdated: now,
				},
			}

			await badgeRef.set(badgeDocument)

			logger.info('Badge created successfully', {
				badgeId,
				createdBy: userId,
				nameLength: name.length,
				descriptionLength: description.length,
				hasImage: !!imageUrl,
			})

			return {
				success: true,
				badgeId,
				message: 'Badge created successfully',
			}
		} catch (error) {
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error creating badge:', {
				userId: auth?.uid,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				'The badge could not be created. Please try again.'
			)
		}
	}
)
