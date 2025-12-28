/**
 * Hook for handling query errors with logging and toast notifications
 *
 * Reduces boilerplate for the common pattern of logging query errors
 * and displaying toast notifications to users.
 */

import { useEffect } from 'react'
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
 * Hook that logs query errors and shows toast notifications
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
export function useQueryErrorHandler({
	error,
	component,
	errorLabel,
	context,
}: UseQueryErrorHandlerOptions): void {
	useEffect(() => {
		if (error) {
			logger.error(`Failed to load ${errorLabel}:`, {
				component,
				error: error.message,
				...context,
			})
			toast.error(`Failed to load ${errorLabel}`, {
				description: error.message,
			})
		}
	}, [error, component, errorLabel, context])
}
