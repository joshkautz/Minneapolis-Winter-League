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
			if (!file) return

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

// Legacy hook interface for backward compatibility
export interface LegacyFileUploadHook {
	uploadedFile: Blob | undefined
	storageRef: StorageReference | undefined
	downloadUrl: string | undefined
	handleFileUpload: (file: Blob, reference: StorageReference) => Promise<void>
	resetUpload: () => void
	uploading: boolean
	downloadLoading: boolean
	uploadError: Error | undefined
	downloadError: Error | undefined
	isLoading: boolean
	setStorageRef: (ref: StorageReference | undefined) => void
	setUploadedFile: (file: Blob | undefined) => void
}

// Legacy version of the hook for backward compatibility
export const useLegacyFileUpload = (): LegacyFileUploadHook => {
	const [uploadedFile, setUploadedFile] = useState<Blob>()
	const [storageRef, setStorageRef] = useState<StorageReference>()
	const [uploadFile, uploading, uploadError] = useUploadFile()
	const [downloadUrl, downloadLoading, downloadError] =
		useDownloadURL(storageRef)

	const handleFileUpload = async (
		file: Blob,
		reference: StorageReference
	): Promise<void> => {
		try {
			setUploadedFile(file)
			setStorageRef(reference)
			await uploadFile(reference, file)
		} catch (error) {
			toast.error('Failed to upload file')
			console.error('File upload error:', error)
		}
	}

	const resetUpload = (): void => {
		setUploadedFile(undefined)
		setStorageRef(undefined)
	}

	return {
		uploadedFile,
		storageRef,
		downloadUrl,
		handleFileUpload,
		resetUpload,
		uploading,
		downloadLoading,
		uploadError: uploadError instanceof Error ? uploadError : undefined,
		downloadError: downloadError instanceof Error ? downloadError : undefined,
		isLoading: uploading || downloadLoading,
		setStorageRef,
		setUploadedFile,
	}
}
