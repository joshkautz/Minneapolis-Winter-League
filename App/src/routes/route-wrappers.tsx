import { ReactNode } from 'react'
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
 * Wrapper for public routes that only need lazy loading
 */
export const PublicRoute = ({ children }: RouteWrapperProps) => {
	return <LazyWrapper>{children}</LazyWrapper>
}

/**
 * Wrapper for authenticated routes that need both protection and lazy loading
 */
export const AuthenticatedRoute = ({ children }: RouteWrapperProps) => {
	return (
		<ProtectedRoute>
			<LazyWrapper>{children}</LazyWrapper>
		</ProtectedRoute>
	)
}
