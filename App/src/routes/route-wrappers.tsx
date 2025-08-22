import { ReactNode } from 'react'
import { LazyWrapper } from '@/components/lazy-wrapper'
import { ProtectedRoute } from '@/components/protected-route'

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
export function PublicRoute({ children }: RouteWrapperProps) {
	return <LazyWrapper>{children}</LazyWrapper>
}

/**
 * Wrapper for authenticated routes that need both protection and lazy loading
 */
export function AuthenticatedRoute({ children }: RouteWrapperProps) {
	return (
		<ProtectedRoute>
			<LazyWrapper>{children}</LazyWrapper>
		</ProtectedRoute>
	)
}
