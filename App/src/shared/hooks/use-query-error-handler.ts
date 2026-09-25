/**
 * Hook for handling query errors with logging and toast notifications
 *
 * Reduces boilerplate for the common pattern of logging query errors
 * and displaying toast notifications to users.
 */

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { logger } from '@/shared/utils'

interface UseQueryErrorHandlerOptions {
	/** The error from a query (undefined if no error) */
	error: Error | undefined
	/** Component name for logging context */
	component: string
	/** User-friendly label for what failed to load (e.g., "players", "seasons") */
	errorLabel: string
	/** Additional context to include in logs */
	context?: Record<string, unknown>
}

/**
 * Hook that logs query errors and shows toast notifications, once per error.
 *
 * Only `error` decides when it fires. The other options are read through a
 * ref, so a `context` object built inline on every render does not toast
 * the same error again on each re-render.
 *
 * @example
 * ```tsx
 * const [data, loading, error] = useCollection(query)
 * useQueryErrorHandler({
 *   error,
 *   component: 'PlayerManagement',
 *   errorLabel: 'players',
 * })
 * ```
 */
export function useQueryErrorHandler(
	options: UseQueryErrorHandlerOptions
): void {
	const optionsRef = useRef(options)
	useEffect(() => {
		optionsRef.current = options
	})

	const { error } = options
	useEffect(() => {
		if (!error) return
		const { component, errorLabel, context } = optionsRef.current
		logger.error(`Failed to load ${errorLabel}`, error, {
			component,
			...context,
		})
		toast.error(`Failed to load ${errorLabel}`, {
			description: error.message,
		})
	}, [error])
}
