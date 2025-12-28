/**
 * Custom hook type definitions
 *
 * Standardized type definitions for custom hooks to ensure
 * consistent return types and improved type safety.
 */

/**
 * Return type for the useFileUpload hook
 */
export interface FileUploadHookReturn {
	// State
	files: File[]
	uploading: boolean
	progress: number
	error: Error | null
	uploadedUrls: string[]
	// Actions
	uploadFiles: (files: File[]) => Promise<void>
	removeFile: (index: number) => void
	clearFiles: () => void
	reset: () => void
}
