/**
 * Route-specific Error Boundary wrapper
 *
 * Provides a convenient wrapper for route-level error boundaries
 * with optional route context for better error reporting.
 */

import { ErrorInfo, ReactNode } from 'react'
import { ErrorBoundary } from './error-boundary'

interface RouteErrorBoundaryProps {
	children: ReactNode
	routeName?: string
	onError?: (error: Error, errorInfo: ErrorInfo) => void
}

export const RouteErrorBoundary = ({
	children,
	routeName,
	onError,
}: RouteErrorBoundaryProps) => {
	const handleError = (error: Error, errorInfo: ErrorInfo) => {
		// Add route context to the error if routeName is provided
		if (routeName) {
			// eslint-disable-next-line no-console
			console.error(`Route Error [${routeName}]:`, error.message)
		}

		// Call the custom onError handler if provided
		if (onError) {
			onError(error, errorInfo)
		}
	}

	return <ErrorBoundary onError={handleError}>{children}</ErrorBoundary>
}
