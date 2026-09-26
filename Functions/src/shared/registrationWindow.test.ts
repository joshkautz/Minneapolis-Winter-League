import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import { assertRegistrationOpen } from './registrationWindow.js'

const endsAt = (iso: string) => ({
	registrationEnd: Timestamp.fromDate(new Date(iso)),
})

describe('assertRegistrationOpen', () => {
	it('allows a change before registration ends', () => {
		expect(() =>
			assertRegistrationOpen(
				endsAt('2026-10-31T23:59:00-05:00'),
				'Too late.',
				'America/Chicago',
				new Date('2026-10-15T12:00:00-05:00')
			)
		).not.toThrow()
	})

	it('refuses after it ends, saying when, in the caller’s timezone', () => {
		expect(() =>
			assertRegistrationOpen(
				endsAt('2026-10-31T23:59:00-05:00'),
				'Team registration has closed.',
				'America/Chicago',
				new Date('2026-11-01T09:00:00-06:00')
			)
		).toThrow(
			expect.objectContaining({
				code: 'failed-precondition',
				message: expect.stringMatching(
					/^Team registration has closed\. Registration ended October 31, 2026/
				),
			})
		)
	})
})
