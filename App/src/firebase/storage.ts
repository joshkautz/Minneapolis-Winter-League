import {
	ref,
	getStorage,
	deleteObject,
	StorageReference,
} from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { functions } from './app'
import { logger } from '@/shared/utils'

const storage = getStorage()

const deleteImage = (ref: StorageReference) => {
	return deleteObject(ref)
}

/**
 * Client-side wrapper for getUploadUrl Firebase Function
 * Gets a signed upload URL for secure file uploads
 */
export const getUploadUrlViaFunction = httpsCallable<
	{
		fileName: string
		contentType: string
		filePath: string
	},
	{
		uploadUrl: string
		fileName: string
		filePath: string
		expiresAt: number
	}
>(functions, 'getUploadUrl')

/**
 * Client-side wrapper for getDownloadUrl Firebase Function
 * Gets a signed download URL for secure file access
 */
export const getDownloadUrlViaFunction = httpsCallable<
	{
		filePath: string
	},
	{
		downloadUrl: string
		expiresAt: number
	}
>(functions, 'getDownloadUrl')

/**
 * Client-side wrapper for getFileMetadata Firebase Function
 * Gets metadata information about a stored file
 */
export const getFileMetadataViaFunction = httpsCallable<
	{
		filePath: string
	},
	{
		name: string
		size: string
		contentType: string
		timeCreated: string
		updated: string
		generation: string
	}
>(functions, 'getFileMetadata')

/**
 * Helper function to upload a file using the signed URL
 * @param file - The file to upload
 * @param uploadUrl - The signed upload URL from getUploadUrlViaFunction
 * @param contentType - The content type of the file
 * @returns Promise<Response>
 */
export const uploadFileToSignedUrl = async (
	file: File | Blob,
	uploadUrl: string,
	contentType: string
): Promise<Response> => {
	const response = await fetch(uploadUrl, {
		method: 'PUT',
		headers: {
			'Content-Type': contentType,
		},
		body: file,
	})

	if (!response.ok) {
		throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
	}

	return response
}

/**
 * Complete file upload workflow
 * @param file - The file to upload
 * @param filePath - The storage path where the file should be stored
 * @returns Promise with upload result
 */
export const uploadFile = async (
	file: File,
	filePath: string
): Promise<{
	success: boolean
	fileName?: string
	filePath?: string
	error?: string
}> => {
	try {
		// Validate file
		if (!file) {
			throw new Error('No file provided')
		}

		// Validate file type
		if (!file.type.startsWith('image/')) {
			throw new Error('Only image files are allowed')
		}

		// Validate file size (5MB limit)
		const maxSize = 5 * 1024 * 1024 // 5MB
		if (file.size > maxSize) {
			throw new Error('File size must be less than 5MB')
		}

		// Get upload URL
		const uploadUrlResult = await getUploadUrlViaFunction({
			fileName: file.name,
			contentType: file.type,
			filePath,
		})

		if (!uploadUrlResult.data) {
			throw new Error('Failed to get upload URL')
		}

		const { uploadUrl, fileName, filePath: storagePath } = uploadUrlResult.data

		// Upload file to signed URL
		await uploadFileToSignedUrl(file, uploadUrl, file.type)

		return {
			success: true,
			fileName,
			filePath: storagePath,
		}
	} catch (error) {
		logger.error('File upload error', error, {
			component: 'storage',
			action: 'upload_file',
		})
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred',
		}
	}
}

export { storage, ref, deleteImage, type StorageReference }
