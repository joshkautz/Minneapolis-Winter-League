import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
	formatClockTime,
	formatKickoffTime,
	formatRelativeTime,
	formatRelativeTimestamp,
	formatShortDate,
	formatTimestamp,
} from './date-time'

/**
 * Dates and times read on Minneapolis's clock whatever the reader's zone,
 * so these run in UTC, where the machine's own clock would say otherwise.
 */
beforeAll(() => {
	vi.stubEnv('TZ', 'UTC')
})
afterAll(() => {
	vi.unstubAllEnvs()
})

describe('table date formatting', () => {
	// 2:30pm on 25 September 2026 in Minneapolis (CDT).
	const date = new Date('2026-09-25T19:30:00Z')

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

describe('league-time formatting', () => {
	/** 6:00pm in Minneapolis on 7 November 2026; midnight on the 8th in UTC. */
	const kickoff = new Date('2026-11-08T00:00:00Z')

	it('shows a kickoff at its Minneapolis time', () => {
		expect(formatKickoffTime(kickoff)).toBe('6:00 PM')
		expect(formatClockTime(kickoff)).toBe('06:00 PM')
	})

	it('shows a kickoff on its Minneapolis day', () => {
		expect(formatShortDate(kickoff)).toBe('Nov 7, 2026')
		expect(formatTimestamp(Timestamp.fromDate(kickoff))).toBe(
			'November 7, 2026'
		)
	})
})
