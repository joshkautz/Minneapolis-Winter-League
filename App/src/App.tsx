import { AppRoutes } from '@/routes'
import { GlobalErrorBoundary } from '@/components/ui/global-error-boundary'

/**
 * Main Application Component
 *
 * Route configuration and rendering with global error handling.
 * User data refresh (including email verification) is handled by AuthContextProvider.
 */
const App = () => {
	return (
		<GlobalErrorBoundary>
			<AppRoutes />
		</GlobalErrorBoundary>
	)
}

export default App
