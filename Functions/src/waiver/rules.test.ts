import { describe, expect, it } from 'vitest'
import { FIREBASE_CONFIG } from '../config/constants.js'
import {
	LEAGUE_TIME_ZONE,
	ageOn,
	isIsoDate,
	isMinorOn,
	leagueToday,
	namesMatch,
	waiverSubmissionErrors,
	type WaiverSubmission,
} from './rules.js'

/**
 * The rules a waiver submission must meet. The form and the callable both
 * run these, so a player never passes one and fails the other.
 */

const TODAY = '2026-10-01'
const PROFILE_NAME = 'Mary-Jo O’Neil'

const adult = (
	overrides: Partial<Omit<WaiverSubmission, 'versionId'>> = {}
): Omit<WaiverSubmission, 'versionId'> => ({
	dateOfBirth: '1990-05-17',
	mailingAddress: '123 Main St, Minneapolis, MN 55401',
	emergencyContacts: [
		{ name: 'Sam Doe', relationship: 'Partner', phone: '(612) 555-0100' },
	],
	signerName: 'mary jo oneil',
	agreed: true,
	...overrides,
})

const errorsFor = (submission: Omit<WaiverSubmission, 'versionId'>) =>
	waiverSubmissionErrors(submission, {
		participantName: PROFILE_NAME,
		today: TODAY,
	})

describe('isIsoDate', () => {
	it.each(['2026-10-01', '2000-02-29'])('accepts %s', (value) => {
		expect(isIsoDate(value)).toBe(true)
	})

	it.each(['2026-02-30', '2025-02-29', '10/01/2026', '2026-1-1', ''])(
		'refuses %s',
		(value) => {
			expect(isIsoDate(value)).toBe(false)
		}
	)
})

describe('ageOn', () => {
	it('counts a birthday from the day itself', () => {
		expect(ageOn('2008-10-01', '2026-10-01')).toBe(18)
		expect(ageOn('2008-10-02', '2026-10-01')).toBe(17)
	})

	it('handles a birthday later in the year', () => {
		expect(ageOn('1990-12-31', '2026-10-01')).toBe(35)
	})

	it('treats 18 as an adult and 17 as a minor', () => {
		expect(isMinorOn('2008-10-01', '2026-10-01')).toBe(false)
		expect(isMinorOn('2008-10-02', '2026-10-01')).toBe(true)
	})
})

describe('LEAGUE_TIME_ZONE', () => {
	it('matches the Functions config, which this file cannot import', () => {
		expect(LEAGUE_TIME_ZONE).toBe(FIREBASE_CONFIG.TIME_ZONE)
	})
})

describe('leagueToday', () => {
	it('is the date in Minneapolis, not UTC', () => {
		// 03:30 UTC on Oct 2 is still the evening of Oct 1 in Minneapolis.
		expect(leagueToday(new Date('2026-10-02T03:30:00Z'))).toBe('2026-10-01')
		expect(leagueToday(new Date('2026-10-02T05:30:00Z'))).toBe('2026-10-02')
	})
})

describe('namesMatch', () => {
	it('ignores case, spacing and punctuation', () => {
		expect(namesMatch('  mary  jo oneil ', PROFILE_NAME)).toBe(true)
		expect(namesMatch("MARY-JO O'NEIL", PROFILE_NAME)).toBe(true)
	})

	it('does not match a different name', () => {
		expect(namesMatch('Mary Oneil', PROFILE_NAME)).toBe(false)
	})

	it('does not match nothing', () => {
		expect(namesMatch('  ', '')).toBe(false)
	})
})

describe('waiverSubmissionErrors', () => {
	it('accepts a complete adult submission', () => {
		expect(errorsFor(adult())).toEqual({})
	})

	it('requires the box to be checked', () => {
		expect(errorsFor(adult({ agreed: false })).agreed).toBeDefined()
	})

	it('requires an adult to type the name on their profile', () => {
		expect(errorsFor(adult({ signerName: 'Someone Else' })).signerName).toBe(
			`Type your name as it appears on your profile: ${PROFILE_NAME}.`
		)
	})

	it.each([
		['missing', ''],
		['not a date', '1990-13-01'],
		['in the future', '2026-10-02'],
		['implausibly old', '1900-01-01'],
	])('refuses a date of birth that is %s', (_why, dateOfBirth) => {
		expect(errorsFor(adult({ dateOfBirth })).dateOfBirth).toBeDefined()
	})

	it('requires a mailing address', () => {
		expect(errorsFor(adult({ mailingAddress: '  ' })).mailingAddress).toBe(
			'Enter your mailing address.'
		)
	})

	it('requires an emergency contact', () => {
		expect(errorsFor(adult({ emergencyContacts: [] })).emergencyContacts).toBe(
			'Add at least one emergency contact.'
		)
	})

	it('allows up to three emergency contacts', () => {
		const contact = { name: 'A', relationship: 'Friend', phone: '6125550100' }
		expect(
			errorsFor(adult({ emergencyContacts: [contact, contact, contact] }))
		).toEqual({})
		expect(
			errorsFor(
				adult({ emergencyContacts: [contact, contact, contact, contact] })
			).emergencyContacts
		).toBeDefined()
	})

	it.each([
		['name', { name: '', relationship: 'Friend', phone: '6125550100' }],
		['relationship', { name: 'A', relationship: ' ', phone: '6125550100' }],
		['phone', { name: 'A', relationship: 'Friend', phone: '555' }],
	])('names the contact missing a %s', (_field, contact) => {
		const valid = { name: 'B', relationship: 'Friend', phone: '6125550100' }
		expect(
			errorsFor(adult({ emergencyContacts: [valid, contact] }))
				.emergencyContacts
		).toMatch(/contact 2/)
	})

	describe('for a player under 18', () => {
		const minor = (
			overrides: Partial<Omit<WaiverSubmission, 'versionId'>> = {}
		) =>
			adult({
				dateOfBirth: '2010-03-04',
				signerName: 'Pat Oneil',
				guardianRelationship: 'Mother',
				...overrides,
			})

		it('accepts a parent or guardian signing', () => {
			expect(errorsFor(minor())).toEqual({})
		})

		it("does not require the guardian's name to match the player's", () => {
			expect(errorsFor(minor({ signerName: 'Anyone Else' }))).toEqual({})
		})

		it('refuses the player signing as their own guardian', () => {
			expect(errorsFor(minor({ signerName: PROFILE_NAME })).signerName).toMatch(
				/parent or guardian must sign/
			)
		})

		it('requires the relationship', () => {
			expect(
				errorsFor(minor({ guardianRelationship: '' })).guardianRelationship
			).toBeDefined()
		})

		it('asks for the guardian by name when the signature is blank', () => {
			expect(errorsFor(minor({ signerName: '' })).signerName).toBe(
				"Type the parent or guardian's full name to sign."
			)
		})
	})

	it('does not ask an adult for a guardian relationship', () => {
		expect(errorsFor(adult({ guardianRelationship: '' }))).toEqual({})
	})
})
