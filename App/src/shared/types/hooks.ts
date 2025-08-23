/**
 * Custom hook type definitions
 *
 * Standardized type definitions for custom hooks to ensure
 * consistent return types and improved type safety.
 */

// File upload hook types
export interface FileUploadHookState {
	files: File[]
	uploading: boolean
	progress: number
	error: Error | null
	uploadedUrls: string[]
}

export interface FileUploadHookActions {
	uploadFiles: (files: File[]) => Promise<void>
	removeFile: (index: number) => void
	clearFiles: () => void
	reset: () => void
}

export type FileUploadHookReturn = FileUploadHookState & FileUploadHookActions
