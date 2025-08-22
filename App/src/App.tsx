import { AppRoutes } from '@/routes'
import { useEmailVerificationPolling } from '@/hooks/use-email-verification-polling'

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
function App() {
	// Handle email verification polling
	useEmailVerificationPolling()

	return <AppRoutes />
}

export default App
