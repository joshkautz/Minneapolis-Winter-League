import { describe, expect, test } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ProvidersWrapper } from '@/providers'

/**
 * Smoke test for the application shell.
 *
 * The provider stack and router mirror main.tsx on purpose. App itself renders
 * only AppRoutes inside the global error boundary, so mounting it bare makes
 * NavigationBar's useAuthContext() throw and the error boundary swallows it —
 * the render "succeeds" while the real tree never mounts. Asserting on
 * navigation landmarks rather than page copy keeps this test about wiring
 * rather than content.
 */
describe('App', () => {
	test('renders the navigation shell without tripping the error boundary', async () => {
		render(
			<ProvidersWrapper>
				<BrowserRouter>
					<App />
				</BrowserRouter>
			</ProvidersWrapper>
		)

		// AuthContextProvider settles its initial auth state asynchronously.
		await waitFor(() => {
			expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
		})

		for (const label of [/news/i, /schedule/i, /standings/i, /teams/i]) {
			expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
		}

		// The global error boundary replaces the entire tree with its fallback,
		// so its absence is what proves the providers are wired correctly.
		expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
	})
})
