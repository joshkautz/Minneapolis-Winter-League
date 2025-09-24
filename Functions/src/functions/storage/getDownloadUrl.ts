/**
 * Get download URL callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { validateAuthentication } from '../../shared/auth.js'

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
			validateAuthentication(request.auth)

			const { filePath } = request.data

			// Validate required parameters
			if (!filePath) {
				throw new HttpsError('invalid-argument', 'File path is required')
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
				uid: request.auth!.uid,
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
