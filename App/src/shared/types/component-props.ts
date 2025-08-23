/**
 * Shared component prop interfaces
 *
 * Centralized type definitions for commonly used component props
 * to improve consistency and reduce duplication.
 */

import { ReactNode } from 'react'

// Base component props
export interface BaseComponentProps {
	children?: ReactNode
	className?: string
}

// Common callback props
export interface CallbackProps {
	onSuccess?: () => void
	onError?: (error: Error) => void
	onCancel?: () => void
}

// Form-related props
export interface FormProps extends CallbackProps {
	isLoading?: boolean
	disabled?: boolean
}

// Modal/Dialog props
export interface ModalProps extends BaseComponentProps {
	isOpen: boolean
	onClose: () => void
	title?: string
	description?: string
}

// Navigation props
export interface NavigationProps {
	onNavigate?: (path: string) => void
	returnPath?: string
}

// Data loading props
export interface LoadingProps {
	isLoading: boolean
	error?: Error | null
	retry?: () => void
}

// Pagination props
export interface PaginationProps {
	currentPage: number
	totalPages: number
	onPageChange: (page: number) => void
	pageSize?: number
}

// Search props
export interface SearchProps {
	query: string
	onQueryChange: (query: string) => void
	placeholder?: string
}

// Selection props
export interface SelectionProps<T> {
	selected: T | T[]
	onSelect: (item: T) => void
	multiple?: boolean
}

// File upload props
export interface FileUploadProps extends CallbackProps {
	accept?: string
	multiple?: boolean
	maxSize?: number
	onFileSelect: (files: File[]) => void
}

// Result handling props
export interface ResultHandlerProps {
	handleResult: ({
		success,
		title,
		description,
		navigation,
	}: {
		success: boolean
		title: string
		description: string
		navigation: boolean
	}) => void
}
