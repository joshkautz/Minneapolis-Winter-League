import { toast } from 'sonner'
import { logger } from './logger'

/**
 * Error handling utilities for consistent error management across the application
 */

export interface AppError extends Error {
	code?: string
	context?: Record<string, unknown>
}

export enum ErrorType {
	AUTHENTICATION = 'authentication',
	AUTHORIZATION = 'authorization',
	VALIDATION = 'validation',
	NETWORK = 'network',
	FIREBASE = 'firebase',
	DROPBOX = 'dropbox',
	UNEXPECTED = 'unexpected',
}

/**
 * Firebase Functions error structure (wrapped HttpsError)
 */
export interface FirebaseFunctionsError {
	code: string
	details?: {
		body?: { error?: { errorMsg?: string } }
	}
	message?: string
}

/**
 * Dropbox Sign HTTP error structure
 */
export interface DropboxHttpError {
	body?: { error?: { errorMsg?: string } }
}

/**
 * Type guard to check if error is a Firebase Functions error
 */
export function isFirebaseFunctionsError(
	err: unknown
): err is FirebaseFunctionsError {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		typeof (err as FirebaseFunctionsError).code === 'string'
	)
}

/**
 * Type guard to check if error is a Dropbox HTTP error
 */
export function isDropboxHttpError(err: unknown): err is DropboxHttpError {
	return (
		typeof err === 'object' &&
		err !== null &&
		'body' in err &&
		typeof (err as DropboxHttpError).body === 'object'
	)
}

/**
 * Extract a user-friendly error message from various error types
 */
export function extractErrorMessage(
	error: unknown,
	fallback = 'An unexpected error occurred'
): string {
	if (isFirebaseFunctionsError(error)) {
		// Try to get message from Dropbox error wrapped in Firebase
		const dropboxMsg = error.details?.body?.error?.errorMsg
		if (dropboxMsg) return dropboxMsg

		// Fall back to Firebase error message
		if (error.message) return error.message
	}

	if (isDropboxHttpError(error)) {
		const dropboxMsg = error.body?.error?.errorMsg
		if (dropboxMsg) return dropboxMsg
	}

	if (error instanceof Error) {
		return error.message
	}

	if (typeof error === 'string') {
		return error
	}

	return fallback
}

export interface ErrorHandlerOptions {
	showToast?: boolean
	logError?: boolean
	fallbackMessage?: string
	context?: Record<string, unknown>
}

class ErrorHandler {
	/**
	 * Handle and process errors consistently across the application
	 */
	handle(
		error: Error | AppError | unknown,
		type: ErrorType,
		component: string,
		options: ErrorHandlerOptions = {}
	): void {
		const {
			showToast = true,
			logError = true,
			fallbackMessage = 'An unexpected error occurred',
			context = {},
		} = options

		const processedError = this.processError(error)
		const userMessage = this.getUserMessage(
			processedError,
			type,
			fallbackMessage
		)

		// Log the error
		if (logError) {
			logger.error(`${type} error in ${component}`, processedError, {
				component,
				errorType: type,
				...context,
			})
		}

		// Show user-friendly toast
		if (showToast) {
			toast.error('Error', {
				description: userMessage,
			})
		}
	}

	/**
	 * Handle authentication errors specifically
	 */
	handleAuth(
		error: Error | unknown,
		action: string,
		options?: Partial<ErrorHandlerOptions>
	): void {
		this.handle(error, ErrorType.AUTHENTICATION, 'auth', {
			fallbackMessage: 'Authentication failed. Please try again.',
			...options,
		})

		// Log to auth-specific logger
		logger.auth(
			action,
			false,
			error instanceof Error ? error : new Error(String(error))
		)
	}

	/**
	 * Handle Firebase errors specifically
	 */
	handleFirebase(
		error: Error | unknown,
		operation: string,
		collection?: string,
		options?: Partial<ErrorHandlerOptions>
	): void {
		this.handle(error, ErrorType.FIREBASE, 'firebase', {
			fallbackMessage: 'Database operation failed. Please try again.',
			context: { operation, collection },
			...options,
		})

		// Log to Firebase-specific logger
		logger.firebase(
			operation,
			collection,
			error instanceof Error ? error : new Error(String(error))
		)
	}

	/**
	 * Handle form validation errors
	 */
	handleValidation(
		error: Error | unknown,
		formName: string,
		options?: Partial<ErrorHandlerOptions>
	): void {
		this.handle(error, ErrorType.VALIDATION, 'form', {
			fallbackMessage: 'Please check your input and try again.',
			context: { formName },
			...options,
		})
	}

	/**
	 * Handle network/API errors
	 */
	handleNetwork(
		error: Error | unknown,
		endpoint?: string,
		options?: Partial<ErrorHandlerOptions>
	): void {
		this.handle(error, ErrorType.NETWORK, 'api', {
			fallbackMessage:
				'Network error. Please check your connection and try again.',
			context: { endpoint },
			...options,
		})
	}

	private processError(error: Error | AppError | unknown): Error {
		if (error instanceof Error) {
			return error
		}

		if (typeof error === 'string') {
			return new Error(error)
		}

		if (error && typeof error === 'object' && 'message' in error) {
			return new Error(String((error as { message: unknown }).message))
		}

		return new Error('Unknown error occurred')
	}

	private getUserMessage(
		error: Error,
		type: ErrorType,
		fallback: string
	): string {
		// Firebase-specific error messages
		if (type === ErrorType.FIREBASE || type === ErrorType.AUTHENTICATION) {
			const firebaseMessages: Record<string, string> = {
				'auth/invalid-email': 'Please enter a valid email address.',
				'auth/user-disabled': 'This account has been disabled.',
				'auth/user-not-found': 'No account found with this email address.',
				'auth/wrong-password': 'Incorrect password. Please try again.',
				'auth/too-many-requests':
					'Too many failed attempts. Please try again later.',
				'auth/network-request-failed':
					'Network error. Please check your connection.',
				'auth/email-already-in-use':
					'An account with this email already exists.',
				'auth/weak-password': 'Password should be at least 6 characters.',
				'permission-denied':
					'You do not have permission to perform this action.',
				unavailable:
					'Service is temporarily unavailable. Please try again later.',
				cancelled: 'Operation was cancelled.',
				'deadline-exceeded': 'Operation timed out. Please try again.',
			}

			// Check if error message contains Firebase error code
			for (const [code, message] of Object.entries(firebaseMessages)) {
				if (error.message.includes(code)) {
					return message
				}
			}

			// Extract message from Firebase Functions HttpsError format
			// Firebase Functions errors come in format: "Error: message" or just "message"
			const functionsErrorMatch = error.message.match(/^(?:Error:\s*)?(.+)$/)
			if (functionsErrorMatch && functionsErrorMatch[1]) {
				const extractedMessage = functionsErrorMatch[1].trim()
				if (this.isUserFriendlyMessage(extractedMessage)) {
					return extractedMessage
				}
			}
		}

		// Return the original error message if it's user-friendly, otherwise use fallback
		if (this.isUserFriendlyMessage(error.message)) {
			return error.message
		}

		return fallback
	}

	private isUserFriendlyMessage(message: string): boolean {
		// Check if the message looks like a technical error or user-friendly message
		const technicalPatterns = [
			/^[A-Z_]+$/, // ALL_CAPS constants
			/\b(undefined|null|NaN)\b/i, // Technical values
			/\b(stack|trace|TypeError|ReferenceError)\b/i, // Technical terms
			/^Error:/, // Raw error prefixes
		]

		return !technicalPatterns.some((pattern) => pattern.test(message))
	}
}

export const errorHandler = new ErrorHandler()
