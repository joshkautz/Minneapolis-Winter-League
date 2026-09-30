import { AppRoutes } from '@/routes'
import { GlobalErrorBoundary } from '@/shared/components/errors'

/**
 * Main Application Component
 *
 * Route configuration and rendering with global error handling.
 * User data refresh (including email verification) is handled by AuthContextProvider.
 */
export const App = () => {
	return (
		<GlobalErrorBoundary>
			<AppRoutes />
		</GlobalErrorBoundary>
	)
}
