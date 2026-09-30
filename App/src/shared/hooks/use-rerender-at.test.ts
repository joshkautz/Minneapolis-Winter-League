import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useRerenderAt } from './use-rerender-at'

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(new Date('2026-10-01T04:59:00Z'))
})

afterEach(() => {
	vi.useRealTimers()
})

/** Counts renders of a component using the hook. */
const renders = (moments: number[]) => {
	let count = 0
	const result = renderHook(
		({ at }) => {
			count += 1
			useRerenderAt(at)
		},
		{ initialProps: { at: moments } }
	)
	return { count: () => count, ...result }
}

describe('useRerenderAt', () => {
	it('re-renders just after the moment arrives, and not before', () => {
		const opening = Date.parse('2026-10-01T05:00:00Z')
		const { count } = renders([opening])

		act(() => vi.advanceTimersByTime(59_000))
		expect(count()).toBe(1)

		act(() => vi.advanceTimersByTime(2_000))
		expect(count()).toBe(2)
	})

	it('waits for each moment in turn, soonest first', () => {
		const soon = Date.now() + 1_000
		const later = Date.now() + 5_000
		const { count } = renders([later, soon])

		act(() => vi.advanceTimersByTime(1_500))
		expect(count()).toBe(2)
		act(() => vi.advanceTimersByTime(4_000))
		expect(count()).toBe(3)
	})

	it('ignores moments already past', () => {
		const { count } = renders([Date.now() - 1_000])

		act(() => vi.advanceTimersByTime(60_000))
		expect(count()).toBe(1)
	})

	it('waits in steps for a moment beyond setTimeout’s range', () => {
		// About 60 days away: past the 24.8-day limit of one timeout.
		const far = Date.now() + 60 * 24 * 60 * 60 * 1000
		const { count } = renders([far])

		act(() => vi.advanceTimersByTime(2 ** 31))
		expect(count()).toBe(2)
		act(() => vi.advanceTimersByTime(60 * 24 * 60 * 60 * 1000))
		expect(count()).toBeGreaterThanOrEqual(3)
	})
})
