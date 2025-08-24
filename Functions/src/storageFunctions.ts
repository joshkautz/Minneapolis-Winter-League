import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getStorage } from 'firebase-admin/storage'
import { getAuth } from 'firebase-admin/auth'
import { logger } from 'firebase-functions/v2'

/**
 * Get a signed upload URL for Firebase Storage
 * Provides secure, controlled file upload with validation
 */
export const getUploadUrl = onCall(
	{
		enforceAppCheck: true,
		region: 'us-central1',
	},
	async (request) => {
		try {
			// Validate authentication
			if (!request.auth) {
				throw new HttpsError('unauthenticated', 'User must be authenticated')
			}

			// Validate email verification
			const userRecord = await getAuth().getUser(request.auth.uid)
			if (!userRecord.emailVerified) {
				throw new HttpsError(
					'failed-precondition',
					'User email must be verified'
				)
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
					'Invalid file extension. Allowed: ' + allowedExtensions.join(', ')
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

/**
 * Get a signed download URL for Firebase Storage
 * Provides secure access to uploaded files
 */
export const getDownloadUrl = onCall(
	{
		enforceAppCheck: true,
		region: 'us-central1',
	},
	async (request) => {
		try {
			// Validate authentication
			if (!request.auth) {
				throw new HttpsError('unauthenticated', 'User must be authenticated')
			}

			const { filePath } = request.data

			// Validate required parameters
			if (!filePath) {
				throw new HttpsError('invalid-argument', 'filePath is required')
			}

			// Get storage bucket
			const bucket = getStorage().bucket()
			const file = bucket.file(filePath)

			// Check if file exists
			const [exists] = await file.exists()
			if (!exists) {
				throw new HttpsError('not-found', 'File not found')
			}

			// Generate signed download URL
			const [downloadUrl] = await file.getSignedUrl({
				version: 'v4',
				action: 'read',
				expires: Date.now() + 60 * 60 * 1000, // 1 hour
			})

			logger.info('Generated download URL', {
				uid: request.auth.uid,
				filePath,
			})

			return {
				downloadUrl,
				expiresAt: Date.now() + 60 * 60 * 1000,
			}
		} catch (error) {
			logger.error('Error generating download URL', {
				error,
				uid: request.auth?.uid,
			})

			if (error instanceof HttpsError) {
				throw error
			}

			throw new HttpsError('internal', 'Failed to generate download URL')
		}
	}
)

/**
 * Get file metadata for a stored file
 * Provides information about uploaded files
 */
export const getFileMetadata = onCall(
	{
		enforceAppCheck: true,
		region: 'us-central1',
	},
	async (request) => {
		try {
			// Validate authentication
			if (!request.auth) {
				throw new HttpsError('unauthenticated', 'User must be authenticated')
			}

			const { filePath } = request.data

			// Validate required parameters
			if (!filePath) {
				throw new HttpsError('invalid-argument', 'filePath is required')
			}

			// Get storage bucket
			const bucket = getStorage().bucket()
			const file = bucket.file(filePath)

			// Check if file exists and get metadata
			const [exists] = await file.exists()
			if (!exists) {
				throw new HttpsError('not-found', 'File not found')
			}

			const [metadata] = await file.getMetadata()

			logger.info('Retrieved file metadata', {
				uid: request.auth.uid,
				filePath,
			})

			return {
				name: metadata.name,
				size: metadata.size,
				contentType: metadata.contentType,
				timeCreated: metadata.timeCreated,
				updated: metadata.updated,
				generation: metadata.generation,
			}
		} catch (error) {
			logger.error('Error getting file metadata', {
				error,
				uid: request.auth?.uid,
			})

			if (error instanceof HttpsError) {
				throw error
			}

			throw new HttpsError('internal', 'Failed to get file metadata')
		}
	}
)
