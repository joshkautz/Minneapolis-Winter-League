/**
 * Custom hook type definitions
 *
 * Standardized type definitions for custom hooks to ensure
 * consistent return types and improved type safety.
 */

// Common hook return patterns
export interface AsyncHookState<T> {
	data: T | null
	loading: boolean
	error: Error | null
}

export interface AsyncHookActions {
	refetch: () => Promise<void>
	reset: () => void
}

export type AsyncHookReturn<T> = AsyncHookState<T> & AsyncHookActions

// Form hook types
export interface FormHookState<T> {
	values: T
	errors: Partial<Record<keyof T, string>>
	touched: Partial<Record<keyof T, boolean>>
	isSubmitting: boolean
	isValid: boolean
	isDirty: boolean
}

export interface FormHookActions<T> {
	setValue: (field: keyof T, value: T[keyof T]) => void
	setError: (field: keyof T, error: string) => void
	clearError: (field: keyof T) => void
	clearErrors: () => void
	setTouched: (field: keyof T, touched?: boolean) => void
	resetForm: () => void
	submitForm: () => Promise<void>
}

export type FormHookReturn<T> = FormHookState<T> & FormHookActions<T>

// Search hook types
export interface SearchHookState<T> {
	query: string
	results: T[]
	loading: boolean
	error: Error | null
	hasMore: boolean
}

export interface SearchHookActions {
	setQuery: (query: string) => void
	search: (query: string) => Promise<void>
	loadMore: () => Promise<void>
	clearResults: () => void
}

export type SearchHookReturn<T> = SearchHookState<T> & SearchHookActions

// Pagination hook types
export interface PaginationHookState {
	currentPage: number
	totalPages: number
	pageSize: number
	totalItems: number
	hasNextPage: boolean
	hasPreviousPage: boolean
}

export interface PaginationHookActions {
	goToPage: (page: number) => void
	nextPage: () => void
	previousPage: () => void
	setPageSize: (size: number) => void
}

export type PaginationHookReturn = PaginationHookState & PaginationHookActions

// Local storage hook types
export interface LocalStorageHookReturn<T> {
	value: T | null
	setValue: (value: T) => void
	removeValue: () => void
	loading: boolean
	error: Error | null
}

// Debounced value hook types
export interface DebouncedValueHookReturn<T> {
	debouncedValue: T
	isDebouncing: boolean
}

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

// Permission hook types
export interface PermissionHookState {
	hasPermission: boolean
	loading: boolean
	error: Error | null
}

export interface PermissionHookActions {
	checkPermission: () => Promise<void>
	refreshPermissions: () => Promise<void>
}

export type PermissionHookReturn = PermissionHookState & PermissionHookActions

// Media query hook types
export interface MediaQueryHookReturn {
	matches: boolean
	loading: boolean
}

// Generic hook utilities
export type HookCleanupFunction = () => void
export type HookEffectCallback = () => void | HookCleanupFunction
export type HookDependencyList = ReadonlyArray<unknown>
