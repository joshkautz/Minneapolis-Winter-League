import { describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
	formatClockTime,
	formatRelativeTime,
	formatRelativeTimestamp,
	formatShortDate,
} from './date-time'

describe('table date formatting', () => {
	const date = new Date(2026, 8, 25, 14, 30)

	it('formats a short date', () => {
		expect(formatShortDate(date)).toBe('Sep 25, 2026')
	})

	it('formats a clock time', () => {
		expect(formatClockTime(date)).toBe('02:30 PM')
	})
})

describe('formatRelativeTime', () => {
	it('says how long ago', () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date(2026, 8, 25, 17, 30))
		expect(formatRelativeTime(new Date(2026, 8, 25, 14, 30))).toBe(
			'about 3 hours ago'
		)
		vi.useRealTimers()
	})

	it('says "Recently" for a date it cannot read', () => {
		expect(formatRelativeTime(new Date(Number.NaN))).toBe('Recently')
	})
})

describe('formatRelativeTimestamp', () => {
	it('says how long ago a timestamp was', () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date(2026, 8, 25, 17, 30))
		const threeHoursAgo = Timestamp.fromDate(new Date(2026, 8, 25, 14, 30))
		expect(formatRelativeTimestamp(threeHoursAgo)).toBe('about 3 hours ago')
		vi.useRealTimers()
	})

	it('says "Recently" for a timestamp the server has yet to fill in', () => {
		expect(formatRelativeTimestamp(null)).toBe('Recently')
	})
})
