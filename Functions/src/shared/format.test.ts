import { describe, expect, it } from 'vitest'
import { formatDateForUser } from './format.js'

/**
 * Dates in callable error messages. The App does not always send the
 * reader's zone, and the server's own is UTC, so a Central registration
 * deadline of 11:59 PM on October 31 read as 4:59 AM on November 1.
 */
const DEADLINE = new Date('2026-11-01T04:59:00Z') // Oct 31, 11:59 PM CDT

describe('formatDateForUser', () => {
	it('shows Minneapolis time when no zone is given', () => {
		expect(formatDateForUser(DEADLINE)).toBe('October 31, 2026 at 11:59 PM CDT')
	})

	it("uses the reader's zone when one is given", () => {
		expect(formatDateForUser(DEADLINE, 'America/New_York')).toBe(
			'November 1, 2026 at 12:59 AM EDT'
		)
	})

	it('treats an empty zone as none', () => {
		expect(formatDateForUser(DEADLINE, '')).toBe(
			'October 31, 2026 at 11:59 PM CDT'
		)
	})
})
