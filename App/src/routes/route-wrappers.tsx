import { ReactNode } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { AdminGate, LazyWrapper, ProtectedRoute } from '@/shared/components'

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

/**
 * Wrapper for admin routes: an authenticated route that renders only for an
 * admin. The page's chunk is not even loaded for anyone else.
 */
export const AdminRoute = ({ children }: RouteWrapperProps) => {
	return (
		<ProtectedRoute>
			<AdminGate>
				<LazyWrapper>
					<ErrorBoundary>{children}</ErrorBoundary>
				</LazyWrapper>
			</AdminGate>
		</ProtectedRoute>
	)
}
