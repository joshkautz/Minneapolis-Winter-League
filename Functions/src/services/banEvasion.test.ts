import { describe, expect, it } from 'vitest'
import {
	MATCH_THRESHOLD,
	sharedSignals,
	type IdentityRecord,
} from './banEvasion.js'

/**
 * What a new waiver shares with a banned player's records. Formatting must
 * not hide a match — the same phone typed two ways, an apostrophe or not —
 * and a single coincidence must not be enough to flag anyone.
 */

const person = (overrides: Partial<IdentityRecord> = {}): IdentityRecord => ({
	name: 'Aiden Lomen',
	dateOfBirth: '2001-04-09',
	mailingAddress: '12 Elm St, Minneapolis, MN 55401',
	phones: ['(612) 555-0100'],
	ipAddress: '203.0.113.9',
	...overrides,
})

const stranger = person({
	name: 'Pat Smith',
	dateOfBirth: '1990-01-01',
	mailingAddress: '9 Oak Ave, St Paul, MN 55101',
	phones: ['651-555-0199'],
	ipAddress: '198.51.100.7',
})

const flagged = (signals: string[]) => signals.length >= MATCH_THRESHOLD

describe('sharedSignals', () => {
	it('finds everything two records share', () => {
		expect(sharedSignals(person(), [person()]).sort()).toEqual(
			[
				'IP address',
				'date of birth',
				'emergency contact phone',
				'full name',
				'last name',
				'mailing address',
			].sort()
		)
	})

	it('finds nothing in a stranger', () => {
		expect(sharedSignals(person(), [stranger])).toEqual([])
	})

	it('sees past formatting', () => {
		const typedDifferently = person({
			name: '  aiden   LOMEN ',
			mailingAddress: '12 elm st. minneapolis mn 55401',
			phones: ['+1 612 555 0100'],
		})

		expect(sharedSignals(typedDifferently, [person()])).toEqual(
			expect.arrayContaining([
				'full name',
				'mailing address',
				'emergency contact phone',
			])
		)
	})

	it('matches any of the banned player’s records, across seasons', () => {
		const accountName = person({
			dateOfBirth: null,
			mailingAddress: null,
			phones: [],
			ipAddress: null,
		})
		const oldWaiver = { ...stranger, dateOfBirth: '2001-04-09' }

		expect(
			sharedSignals(person({ name: 'Aidenn Lomen' }), [accountName, oldWaiver])
		).toEqual(expect.arrayContaining(['last name', 'date of birth']))
	})
})

describe('the threshold', () => {
	it('flags a full name alone, which is a first and last name together', () => {
		expect(
			flagged(sharedSignals(person(), [{ ...stranger, name: 'Aiden Lomen' }]))
		).toBe(true)
	})

	it('flags a renamed account that shares a birthday and an address', () => {
		const renamed = person({
			name: 'Jordan Rivers',
			phones: [],
			ipAddress: null,
		})

		expect(flagged(sharedSignals(renamed, [person()]))).toBe(true)
	})

	it('does not flag a single coincidence', () => {
		expect(
			flagged(
				sharedSignals(person(), [{ ...stranger, dateOfBirth: '2001-04-09' }])
			)
		).toBe(false)
		expect(
			flagged(sharedSignals(person(), [{ ...stranger, name: 'Morgan Lomen' }]))
		).toBe(false)
	})
})
