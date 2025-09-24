/**
 * Route-specific Error Boundary wrapper
 *
 * Provides a convenient wrapper for route-level error boundaries
 * with optional route context for better error reporting.
 */

import React from 'react'
import { ErrorBoundary } from './error-boundary'

interface RouteErrorBoundaryProps {
	children: React.ReactNode
	routeName?: string
	onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

export const RouteErrorBoundary: React.FC<RouteErrorBoundaryProps> = ({
	children,
	routeName,
	onError,
}) => {
	const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
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
