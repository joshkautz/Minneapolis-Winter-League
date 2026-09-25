import { ReactNode } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { LazyWrapper, ProtectedRoute } from '@/shared/components'

/**
 * Route wrapper components for consistent route configuration
 *
 * These components eliminate repetitive boilerplate in route definitions
 * and provide a consistent pattern for different route types.
 */

interface RouteWrapperProps {
	children: ReactNode
}

/**
 * Wrapper for public routes: lazy loading and an error boundary
 */
export const PublicRoute = ({ children }: RouteWrapperProps) => {
	return (
		<LazyWrapper>
			<ErrorBoundary>{children}</ErrorBoundary>
		</LazyWrapper>
	)
}

/**
 * Wrapper for authenticated routes: protection, lazy loading and an error
 * boundary
 */
export const AuthenticatedRoute = ({ children }: RouteWrapperProps) => {
	return (
		<ProtectedRoute>
			<LazyWrapper>
				<ErrorBoundary>{children}</ErrorBoundary>
			</LazyWrapper>
		</ProtectedRoute>
	)
}
