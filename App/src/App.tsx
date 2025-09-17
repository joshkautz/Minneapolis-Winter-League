import React from 'react'
import { AppRoutes } from '@/routes'
import { GlobalErrorBoundary } from '@/components/ui/global-error-boundary'
import { useEmailVerificationPolling } from '@/shared/hooks'

/**
 * Main Application Component
 *
 * Handles top-level application concerns:
 * - Email verification polling for authenticated users
 * - Route configuration and rendering
 *
 * This component is now focused solely on application-level orchestration,
 * with route definitions, lazy loading, and auth logic extracted to separate modules.
 */
const App: React.FC = () => {
	// Handle email verification polling
	useEmailVerificationPolling()

	return (
		<GlobalErrorBoundary>
			<AppRoutes />
		</GlobalErrorBoundary>
	)
}

export default App
