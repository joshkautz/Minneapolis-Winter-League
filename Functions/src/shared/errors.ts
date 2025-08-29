/**
 * Error handling utilities for Firebase Functions
 */

import { logger } from 'firebase-functions/v2'

/**
 * Standardized error handler for Firebase Functions
 */
export function handleFunctionError(
	error: unknown,
	context: string,
	metadata?: Record<string, any>
): Error {
	const errorMessage = error instanceof Error ? error.message : 'Unknown error'

	logger.error(`Error in ${context}:`, {
		error: errorMessage,
		stack: error instanceof Error ? error.stack : undefined,
		...metadata,
	})

	return new Error(`${context} failed: ${errorMessage}`)
}
