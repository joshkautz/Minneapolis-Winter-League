import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import {
	assertRegistrationOpen,
	canRegisterAt,
	LATE_PAYMENT_GRACE_MS,
	registrationOverAt,
} from './registrationWindow.js'

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

describe('registering around the close', () => {
	const close = new Date('2026-10-31T23:59:00-05:00')
	const season = endsAt(close.toISOString())
	const at = (msAfterClose: number) => new Date(close.getTime() + msAfterClose)
	const MINUTE = 60_000

	it('lets anything complete a team before the close', () => {
		expect(canRegisterAt(season, at(-MINUTE), 'other')).toBe(true)
		expect(canRegisterAt(season, at(0), 'other')).toBe(true)
	})

	it('does not let a waiver or roster change register a team after the close', () => {
		expect(canRegisterAt(season, at(MINUTE), 'other')).toBe(false)
	})

	it('lets a payment from a checkout opened in time complete a team after the close', () => {
		// A checkout opened a minute before the close can be paid up to its
		// full lifetime later.
		expect(
			canRegisterAt(season, at(LATE_PAYMENT_GRACE_MS - MINUTE), 'payment')
		).toBe(true)
		expect(canRegisterAt(season, at(LATE_PAYMENT_GRACE_MS), 'payment')).toBe(
			true
		)
	})

	it('does not let a payment register a team once no checkout could still be open', () => {
		expect(
			canRegisterAt(season, at(LATE_PAYMENT_GRACE_MS + 1), 'payment')
		).toBe(false)
	})

	it('allows the grace a whole checkout needs', () => {
		expect(LATE_PAYMENT_GRACE_MS).toBe(31 * MINUTE)
	})

	it('leaves teams unrefunded through the grace, then refunds them', () => {
		expect(registrationOverAt(season, at(MINUTE))).toBe(false)
		expect(registrationOverAt(season, at(LATE_PAYMENT_GRACE_MS))).toBe(false)
		expect(registrationOverAt(season, at(LATE_PAYMENT_GRACE_MS + 1))).toBe(true)
	})

	it('never closes a season with no close set', () => {
		expect(canRegisterAt({} as never, at(0), 'other')).toBe(true)
		expect(registrationOverAt({} as never, at(0))).toBe(false)
	})
})
