/**
 * Error handling utilities for Firebase Functions
 */

import { HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'

/**
 * Logs an error a trigger or webhook cannot handle and returns one to throw,
 * naming where it happened and keeping the original as its `cause`.
 */
export function handleFunctionError(
	error: unknown,
	context: string,
	metadata?: Record<string, unknown>
): Error {
	const errorMessage = error instanceof Error ? error.message : 'Unknown error'

	logger.error(`Error in ${context}:`, {
		error: errorMessage,
		stack: error instanceof Error ? error.stack : undefined,
		...metadata,
	})

	return new Error(`${context} failed: ${errorMessage}`, { cause: error })
}

/**
 * The catch-all at the end of a callable.
 *
 * An `HttpsError` is already written for the player, so it goes out as it
 * is. Anything else is logged in full — message, stack and `context` — and
 * replaced by an `internal` error carrying `message`, a fixed sentence
 * saying what failed. The original's text never reaches the browser.
 */
export function rethrowAsHttpsError(
	error: unknown,
	message: string,
	context: Record<string, unknown> = {}
): never {
	if (error instanceof HttpsError) throw error
	logger.error(message, {
		error: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined,
		...context,
	})
	throw new HttpsError('internal', message)
}
