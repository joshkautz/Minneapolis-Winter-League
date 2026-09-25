import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const { toastError, loggerError } = vi.hoisted(() => ({
	toastError: vi.fn(),
	loggerError: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { error: toastError } }))
vi.mock('@/shared/utils', () => ({ logger: { error: loggerError } }))

const { useQueryErrorHandler } = await import('./use-query-error-handler')

describe('useQueryErrorHandler', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('does nothing while there is no error', () => {
		renderHook(() =>
			useQueryErrorHandler({
				error: undefined,
				component: 'Roster',
				errorLabel: 'players',
			})
		)
		expect(loggerError).not.toHaveBeenCalled()
		expect(toastError).not.toHaveBeenCalled()
	})

	it('logs the error itself with its context, and toasts its message', () => {
		const error = new Error('permission-denied')
		renderHook(() =>
			useQueryErrorHandler({
				error,
				component: 'Roster',
				errorLabel: 'players',
				context: { teamId: 'team-1' },
			})
		)
		expect(loggerError).toHaveBeenCalledWith('Failed to load players', error, {
			component: 'Roster',
			teamId: 'team-1',
		})
		expect(toastError).toHaveBeenCalledWith('Failed to load players', {
			description: 'permission-denied',
		})
	})

	it('reports an error once, however often an inline context re-renders', () => {
		const error = new Error('unavailable')
		const { rerender } = renderHook(() =>
			useQueryErrorHandler({
				error,
				component: 'Roster',
				errorLabel: 'players',
				context: { teamId: 'team-1' },
			})
		)
		rerender()
		rerender()
		expect(toastError).toHaveBeenCalledTimes(1)
	})

	it('reports a new error when the query fails again', () => {
		const { rerender } = renderHook(
			({ error }) =>
				useQueryErrorHandler({ error, component: 'Roster', errorLabel: 'x' }),
			{ initialProps: { error: new Error('first') as Error | undefined } }
		)
		rerender({ error: undefined })
		rerender({ error: new Error('second') })
		expect(toastError).toHaveBeenCalledTimes(2)
		expect(toastError).toHaveBeenLastCalledWith('Failed to load x', {
			description: 'second',
		})
	})
})
