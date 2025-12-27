/**
 * Update badge callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { Collections, BadgeDocument } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

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
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
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

		// Validate name if provided
		if (name !== undefined && name !== null) {
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
		}

		// Validate description if provided
		if (description !== undefined && description !== null) {
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

			// Handle image updates
			if (removeImage) {
				// Remove existing image from storage if it exists
				if (existingBadge.storagePath) {
					try {
						const storage = getStorage()
						const bucket = storage.bucket()
						const file = bucket.file(existingBadge.storagePath)
						await file.delete()
						logger.info(`Deleted old badge image: ${existingBadge.storagePath}`)
					} catch (deleteError) {
						logger.warn(
							'Failed to delete old badge image (may not exist):',
							deleteError
						)
					}
				}
				updates.imageUrl = null
				updates.storagePath = null
			} else if (imageBlob && imageContentType) {
				// Remove old image if exists
				if (existingBadge.storagePath) {
					try {
						const storage = getStorage()
						const bucket = storage.bucket()
						const oldFile = bucket.file(existingBadge.storagePath)
						await oldFile.delete()
						logger.info(`Deleted old badge image: ${existingBadge.storagePath}`)
					} catch (deleteError) {
						logger.warn(
							'Failed to delete old badge image (may not exist):',
							deleteError
						)
					}
				}

				// Upload new image
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
					updates.imageUrl = file.publicUrl()
					updates.storagePath = fileName

					logger.info(`Successfully uploaded new badge image: ${badgeId}`, {
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

			// Update badge document
			await badgeRef.update(updates)

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
				`Failed to update badge: ${errorMessage}`
			)
		}
	}
)
