import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from './error-boundary'

/**
 * The boundary has two jobs that pull in opposite directions: report real
 * faults loudly enough that we hear about them, and stay quiet about a stale
 * deployment, which happens after every release and is not a fault at all.
 *
 * The distinction is only visible in what gets rendered, so that is what these
 * assert. React logs caught errors to the console regardless, so the console
 * is stubbed to keep the test output readable.
 */

const Throws = ({ error }: { error: Error }) => {
	throw error
}

const staleChunkError = () =>
	new Error(
		'Failed to fetch dynamically imported module: https://mplswinterleague.com/assets/schedule-CPyrQfwJ.js'
	)

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => {})
	vi.spyOn(console, 'group').mockImplementation(() => {})
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {})
	vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
	it('renders its children when nothing throws', () => {
		render(
			<ErrorBoundary>
				<p>The schedule</p>
			</ErrorBoundary>
		)

		expect(screen.getByText('The schedule')).toBeInTheDocument()
	})

	describe('when a chunk from a previous deployment is gone', () => {
		beforeEach(() => {
			render(
				<ErrorBoundary>
					<Throws error={staleChunkError()} />
				</ErrorBoundary>
			)
		})

		it('says a newer version is available', () => {
			expect(screen.getByRole('heading')).toHaveTextContent(
				/newer version of the site/i
			)
		})

		it('offers refreshing as the only action', () => {
			const buttons = screen.getAllByRole('button')

			expect(buttons).toHaveLength(1)
			expect(buttons[0]).toHaveTextContent(/refresh/i)
		})

		it('does not present it as an error', () => {
			// The whole point: someone who opened a tab this morning did
			// nothing wrong, and "Something went wrong" tells them they did.
			expect(screen.queryByText(/went wrong/i)).not.toBeInTheDocument()
			expect(screen.queryByRole('alert')).not.toBeInTheDocument()
		})

		it('does not show the failed module URL', () => {
			expect(screen.queryByText(/schedule-CPyrQfwJ/)).not.toBeInTheDocument()
		})

		it('takes priority over a custom fallback', () => {
			// Every boundary in the app would otherwise report this as its own
			// kind of failure — the global one calls it an "Application Error".
			render(
				<ErrorBoundary fallback={<p>Application Error</p>}>
					<Throws error={staleChunkError()} />
				</ErrorBoundary>
			)

			expect(screen.queryByText('Application Error')).not.toBeInTheDocument()
		})
	})

	describe('when something genuinely breaks', () => {
		beforeEach(() => {
			render(
				<ErrorBoundary>
					<Throws error={new Error('players.map is not a function')} />
				</ErrorBoundary>
			)
		})

		it('still says something went wrong', () => {
			expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
		})

		it('does not blame a stale deployment', () => {
			expect(
				screen.queryByText(/newer version of the site/i)
			).not.toBeInTheDocument()
		})

		it('does not show the raw error message', () => {
			// It is not actionable for a reader, and the console log carries
			// the component stack and route, which is what we actually use.
			expect(
				screen.queryByText(/players.map is not a function/)
			).not.toBeInTheDocument()
		})

		it('offers reloading and nothing that leaves the page broken', () => {
			const buttons = screen.getAllByRole('button')

			expect(buttons).toHaveLength(1)
			expect(buttons[0]).toHaveTextContent(/reload/i)
		})

		it('logs the fault so we hear about it', () => {
			expect(console.error).toHaveBeenCalled()
		})
	})

	it('uses a custom fallback for a genuine fault', () => {
		render(
			<ErrorBoundary fallback={<p>Application Error</p>}>
				<Throws error={new Error('boom')} />
			</ErrorBoundary>
		)

		expect(screen.getByText('Application Error')).toBeInTheDocument()
	})

	it('calls onError for a genuine fault', () => {
		const onError = vi.fn()

		render(
			<ErrorBoundary onError={onError}>
				<Throws error={new Error('boom')} />
			</ErrorBoundary>
		)

		expect(onError).toHaveBeenCalled()
	})
})
