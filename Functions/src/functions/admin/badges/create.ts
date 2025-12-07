/**
 * Create badge callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { Collections, BadgeDocument } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

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

		// Validate name length (min 3, max 100 characters)
		if (name.trim().length < 3) {
			throw new HttpsError(
				'invalid-argument',
				'Name must be at least 3 characters long'
			)
		}

		if (name.length > 100) {
			throw new HttpsError(
				'invalid-argument',
				'Name must not exceed 100 characters'
			)
		}

		// Validate description length (min 10, max 500 characters)
		if (description.trim().length < 10) {
			throw new HttpsError(
				'invalid-argument',
				'Description must be at least 10 characters long'
			)
		}

		if (description.length > 500) {
			throw new HttpsError(
				'invalid-argument',
				'Description must not exceed 500 characters'
			)
		}

		// Validate image parameters if provided
		if (imageBlob && !imageContentType) {
			throw new HttpsError(
				'invalid-argument',
				'Image content type is required when uploading image'
			)
		}

		if (imageContentType && !imageContentType.startsWith('image/')) {
			throw new HttpsError(
				'invalid-argument',
				'Only image files are allowed for badge images'
			)
		}

		// Validate image size (5MB max)
		if (imageBlob) {
			const bufferSize = Buffer.from(imageBlob, 'base64').length
			const maxSize = 5 * 1024 * 1024 // 5MB
			if (bufferSize > maxSize) {
				throw new HttpsError(
					'invalid-argument',
					'Image size must not exceed 5MB'
				)
			}
		}

		try {
			const firestore = getFirestore()

			// Validate admin authentication
			await validateAdminUser(auth, firestore)

			// Get user reference - auth is validated by validateAdminUser above
			const uid = auth?.uid ?? ''
			const userRef = firestore.collection(Collections.PLAYERS).doc(uid)

			// Create badge reference with auto-generated ID
			const badgeRef = firestore.collection(Collections.BADGES).doc()
			const badgeId = badgeRef.id

			const now = FieldValue.serverTimestamp()

			let imageUrl: string | null = null
			let storagePath: string | null = null

			// Handle image upload if provided
			if (imageBlob && imageContentType) {
				try {
					const storage = getStorage()
					const bucket = storage.bucket()
					const fileName = `badges/${badgeId}`
					const file = bucket.file(fileName)

					// Convert base64 to buffer
					const buffer = Buffer.from(imageBlob, 'base64')

					// Upload file
					await file.save(buffer, {
						metadata: {
							contentType: imageContentType,
						},
					})

					// Make file publicly readable
					await file.makePublic()

					// Get public URL
					imageUrl = file.publicUrl()
					storagePath = fileName

					logger.info(`Successfully uploaded badge image: ${badgeId}`, {
						fileName,
						contentType: imageContentType,
					})
				} catch (uploadError) {
					logger.error('Badge image upload failed:', uploadError)
					throw new HttpsError(
						'internal',
						'Failed to upload badge image. Please try again.'
					)
				}
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
				createdBy: uid,
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
				`Failed to create badge: ${errorMessage}`
			)
		}
	}
)
