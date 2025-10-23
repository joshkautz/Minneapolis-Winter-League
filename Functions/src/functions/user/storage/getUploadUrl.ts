/**
 * Get upload URL callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getStorage } from 'firebase-admin/storage'
import { getAuth } from 'firebase-admin/auth'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

/**
 * Get a signed upload URL for Firebase Storage
 * Provides secure, controlled file upload with validation
 */
export const getUploadUrl = onCall(
	{
		enforceAppCheck: true,
		region: FIREBASE_CONFIG.REGION,
	},
	async (request) => {
		try {
			// Validate authentication
			if (!request.auth) {
				throw new HttpsError('unauthenticated', 'Authentication required')
			}

			// Validate email verification
			const userRecord = await getAuth().getUser(request.auth.uid)
			if (!userRecord.emailVerified) {
				throw new HttpsError('permission-denied', 'Email verification required')
			}

			const { fileName, contentType, filePath } = request.data

			// Validate required parameters
			if (!fileName || !contentType || !filePath) {
				throw new HttpsError(
					'invalid-argument',
					'fileName, contentType, and filePath are required'
				)
			}

			// Validate content type - only images allowed
			if (!contentType.startsWith('image/')) {
				throw new HttpsError('invalid-argument', 'Only image files are allowed')
			}

			// Validate file extension matches content type
			const allowedExtensions = [
				'.jpg',
				'.jpeg',
				'.png',
				'.gif',
				'.webp',
				'.svg',
			]
			const fileExtension = fileName
				.toLowerCase()
				.substring(fileName.lastIndexOf('.'))
			if (!allowedExtensions.includes(fileExtension)) {
				throw new HttpsError(
					'invalid-argument',
					`File extension ${fileExtension} not allowed`
				)
			}

			// Sanitize file path - prevent directory traversal
			const sanitizedPath = filePath.replace(/[^a-zA-Z0-9\-_/]/g, '')
			if (sanitizedPath !== filePath) {
				throw new HttpsError(
					'invalid-argument',
					'Invalid characters in file path'
				)
			}

			// Create unique file name to prevent conflicts
			const timestamp = Date.now()
			const uniqueFileName = `${timestamp}_${fileName}`
			const fullPath = `${sanitizedPath}/${uniqueFileName}`

			// Get storage bucket
			const bucket = getStorage().bucket()
			const file = bucket.file(fullPath)

			// Generate signed upload URL with restrictions
			const [uploadUrl] = await file.getSignedUrl({
				version: 'v4',
				action: 'write',
				expires: Date.now() + 15 * 60 * 1000, // 15 minutes
				contentType: contentType,
				extensionHeaders: {
					'x-goog-content-length-range': '0,5242880', // 5MB limit
				},
			})

			logger.info('Generated upload URL', {
				uid: request.auth.uid,
				fileName: uniqueFileName,
				path: fullPath,
			})

			return {
				uploadUrl,
				fileName: uniqueFileName,
				filePath: fullPath,
				expiresAt: Date.now() + 15 * 60 * 1000,
			}
		} catch (error) {
			logger.error('Error generating upload URL', {
				error,
				uid: request.auth?.uid,
			})

			if (error instanceof HttpsError) {
				throw error
			}

			throw new HttpsError('internal', 'Failed to generate upload URL')
		}
	}
)
