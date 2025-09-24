import { useState } from 'react'
import { useUploadFile, useDownloadURL } from 'react-firebase-hooks/storage'
import { StorageReference } from '@/firebase/storage'
import { toast } from 'sonner'
import type { FileUploadHookReturn } from '@/shared/types'

interface UseFileUploadOptions {
	autoReset?: boolean
	onSuccess?: (downloadUrl: string) => void
	onError?: (error: Error) => void
}

/**
 * Custom hook for handling file uploads with Firebase Storage
 * Provides standardized file upload functionality across components
 */
export const useFileUpload = (
	options: UseFileUploadOptions = {}
): FileUploadHookReturn => {
	const { autoReset = false, onSuccess, onError } = options

	const [files, setFiles] = useState<File[]>([])
	const [uploadedUrls, setUploadedUrls] = useState<string[]>([])
	const [storageRef, setStorageRef] = useState<StorageReference>()
	const [progress, setProgress] = useState<number>(0)
	const [uploadFile, uploading, uploadError] = useUploadFile()
	const [downloadUrl, downloadLoading, downloadError] =
		useDownloadURL(storageRef)

	const uploadFiles = async (filesToUpload: File[]): Promise<void> => {
		try {
			setFiles(filesToUpload)
			setProgress(0)

			// For now, handle single file upload (can be extended for multiple files)
			const file = filesToUpload[0]
			if (!file) {
				return
			}

			// You'll need to provide the storage reference from outside
			if (!storageRef) {
				throw new Error('Storage reference not set')
			}

			await uploadFile(storageRef, file)

			if (downloadUrl) {
				setUploadedUrls((prev) => [...prev, downloadUrl])
				onSuccess?.(downloadUrl)
			}

			setProgress(100)

			if (autoReset) {
				reset()
			}
		} catch (error) {
			const errorObj = error instanceof Error ? error : new Error(String(error))
			onError?.(errorObj)
			toast.error('Failed to upload file')
			console.error('File upload error:', error)
		}
	}

	const removeFile = (index: number): void => {
		setFiles((prev) => prev.filter((_, i) => i !== index))
		setUploadedUrls((prev) => prev.filter((_, i) => i !== index))
	}

	const clearFiles = (): void => {
		setFiles([])
		setUploadedUrls([])
	}

	const reset = (): void => {
		setFiles([])
		setUploadedUrls([])
		setStorageRef(undefined)
		setProgress(0)
	}

	const error =
		uploadError instanceof Error
			? uploadError
			: downloadError instanceof Error
				? downloadError
				: uploadError || downloadError
					? new Error('Upload failed')
					: null

	return {
		files,
		uploading: uploading || downloadLoading,
		progress,
		error,
		uploadedUrls,
		uploadFiles,
		removeFile,
		clearFiles,
		reset,
	}
}
