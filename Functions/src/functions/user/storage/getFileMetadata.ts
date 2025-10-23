/**
 * Get file metadata callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { validateAuthentication } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

/**
 * Get file metadata for a stored file
 * Provides information about uploaded files
 */
export const getFileMetadata = onCall(
	{
		enforceAppCheck: true,
		region: FIREBASE_CONFIG.REGION,
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

			// Check if file exists and get metadata
			const [exists] = await file.exists()
			if (!exists) {
				throw new HttpsError('not-found', 'File not found')
			}

			const [metadata] = await file.getMetadata()

			logger.info('Retrieved file metadata', {
				uid: request.auth!.uid,
				filePath,
				size: metadata.size,
				contentType: metadata.contentType,
			})

			return {
				name: metadata.name,
				bucket: metadata.bucket,
				size:
					typeof metadata.size === 'string'
						? parseInt(metadata.size)
						: metadata.size || 0,
				contentType: metadata.contentType,
				timeCreated: metadata.timeCreated,
				updated: metadata.updated,
				md5Hash: metadata.md5Hash,
				crc32c: metadata.crc32c,
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
