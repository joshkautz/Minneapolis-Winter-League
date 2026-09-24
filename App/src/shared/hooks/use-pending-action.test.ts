import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePendingAction } from './use-pending-action'

/**
 * The hook behind every button that calls the server. What it has to get
 * right: pending for exactly as long as the user should wait, and never
 * running the action twice.
 */

/** A promise the test settles by hand. */
const deferred = <T>() => {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((settle) => {
		resolve = settle
	})
	return { promise, resolve }
}

describe('usePendingAction', () => {
	it('is pending while the action runs, and not after', async () => {
		const call = deferred<void>()
		const { result } = renderHook(() => usePendingAction())

		expect(result.current.pending).toBe(false)

		let running!: Promise<void>
		act(() => {
			running = result.current.run(() => call.promise)
		})
		expect(result.current.pending).toBe(true)

		await act(async () => {
			call.resolve()
			await running
		})
		expect(result.current.pending).toBe(false)
	})

	it('ignores a second run while the first is in flight', async () => {
		const call = deferred<void>()
		let calls = 0
		const action = () => {
			calls++
			return call.promise
		}
		const { result } = renderHook(() => usePendingAction())

		let first!: Promise<void>
		act(() => {
			// Both in the same tick, before a re-render could disable anything.
			first = result.current.run(action)
			void result.current.run(action)
		})
		expect(calls).toBe(1)

		await act(async () => {
			call.resolve()
			await first
		})

		await act(() => result.current.run(async () => {}))
		expect(calls).toBe(1)
		await act(() => result.current.run(action))
		expect(calls).toBe(2)
	})

	it('after success, stays pending until the page reflects the result', async () => {
		const { result, rerender } = renderHook(
			({ reflected }) => usePendingAction(reflected),
			{ initialProps: { reflected: false } }
		)

		await act(() => result.current.run(async () => true))
		// The call has returned but the listener has not caught up.
		expect(result.current.pending).toBe(true)

		rerender({ reflected: true })
		expect(result.current.pending).toBe(false)

		// Once caught up, a later change back (the invite was cancelled
		// elsewhere) leaves the button usable again.
		rerender({ reflected: false })
		expect(result.current.pending).toBe(false)
	})

	it('ends straight away when the page reflected the result first', async () => {
		const { result, rerender } = renderHook(
			({ reflected }) => usePendingAction(reflected),
			{ initialProps: { reflected: false } }
		)

		const call = deferred<boolean>()
		let running!: Promise<void>
		act(() => {
			running = result.current.run(() => call.promise)
		})
		// The listener fires before the callable's response arrives.
		rerender({ reflected: true })

		await act(async () => {
			call.resolve(true)
			await running
		})
		expect(result.current.pending).toBe(false)
	})

	it('does not wait for a result that failed', async () => {
		const { result } = renderHook(() => usePendingAction(false))

		await act(() => result.current.run(async () => false))
		expect(result.current.pending).toBe(false)
	})

	it('clears pending when the action throws', async () => {
		const { result } = renderHook(() => usePendingAction(false))

		await act(async () => {
			await expect(
				result.current.run(async () => {
					throw new Error('boom')
				})
			).rejects.toThrow('boom')
		})
		expect(result.current.pending).toBe(false)

		let calls = 0
		await act(() =>
			result.current.run(async () => {
				calls++
				return false
			})
		)
		expect(calls).toBe(1)
	})
})
