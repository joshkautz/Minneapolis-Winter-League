import { useState } from 'react'
import { useUploadFile, useDownloadURL } from 'react-firebase-hooks/storage'
import { StorageReference } from '@/firebase/storage'
import { toast } from 'sonner'

/**
 * Custom hook for handling file uploads with Firebase Storage
 * Provides standardized file upload functionality across components
 */
export const useFileUpload = () => {
	const [uploadedFile, setUploadedFile] = useState<Blob>()
	const [storageRef, setStorageRef] = useState<StorageReference>()
	const [uploadFile, uploading, uploadError] = useUploadFile()
	const [downloadUrl, downloadLoading, downloadError] = useDownloadURL(storageRef)

	const handleFileUpload = async (file: Blob, reference: StorageReference) => {
		try {
			setUploadedFile(file)
			setStorageRef(reference)
			await uploadFile(reference, file)
		} catch (error) {
			toast.error('Failed to upload file')
			console.error('File upload error:', error)
		}
	}

	const resetUpload = () => {
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
		uploadError,
		downloadError,
		isLoading: uploading || downloadLoading,
		setStorageRef,
		setUploadedFile,
	}
}
