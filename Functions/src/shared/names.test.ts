import { describe, expect, it } from 'vitest'
import { validateAndNormalizeName } from './names.js'

/**
 * These rules exist in two places on purpose — this copy and the App's
 * `nameSchema` — because the App's is not a control. A callable is invocable
 * by any authenticated user, so anything the form would have rejected reaches
 * Firestore unless it is rejected here, and names show up on rosters, the
 * schedule and the public rankings.
 *
 * The cases below mirror `App/src/shared/utils/validation.test.ts`. When one
 * changes, both do.
 */

const codeOf = (value: unknown): string | null => {
	try {
		validateAndNormalizeName(value, 'First name')
		return null
	} catch (error) {
		return (error as { code?: string }).code ?? 'unknown'
	}
}

describe('validateAndNormalizeName', () => {
	it('title-cases each word', () => {
		expect(validateAndNormalizeName('josh kautz', 'First name')).toBe(
			'Josh Kautz'
		)
	})

	it('trims surrounding whitespace', () => {
		expect(validateAndNormalizeName('  josh  ', 'First name')).toBe('Josh')
	})

	it('collapses runs of whitespace', () => {
		expect(validateAndNormalizeName('josh   kautz', 'First name')).toBe(
			'Josh Kautz'
		)
	})

	it('keeps hyphens and apostrophes', () => {
		expect(validateAndNormalizeName("mary-jane o'brien", 'First name')).toBe(
			"Mary-Jane O'Brien"
		)
	})

	it.each([
		['a single character', 'J'],
		['digits', 'Player 1'],
		['symbols', 'Josh@Kautz'],
		['consecutive hyphens', 'Josh--Kautz'],
		['consecutive apostrophes', "o''brien"],
		['only whitespace', '   '],
		['an empty string', ''],
	])('rejects %s', (_label, input) => {
		expect(codeOf(input)).toBe('invalid-argument')
	})

	it('rejects a name longer than 50 characters', () => {
		// The cap is what stops a name from breaking every table it appears
		// in; without a server-side check there is no cap at all.
		expect(codeOf('a'.repeat(51))).toBe('invalid-argument')
	})

	it('accepts a name of exactly 50 characters', () => {
		expect(validateAndNormalizeName('a'.repeat(50), 'First name')).toHaveLength(
			50
		)
	})

	it.each([
		['a number', 42],
		['null', null],
		['undefined', undefined],
		['an object', { first: 'Josh' }],
		['an array', ['Josh']],
	])('rejects %s rather than coercing it', (_label, input) => {
		// A callable receives whatever JSON the caller sends, so a non-string
		// is a real input here in a way it never is behind the form.
		expect(codeOf(input)).toBe('invalid-argument')
	})

	describe('profanity', () => {
		it('rejects an obscenity', () => {
			expect(codeOf('Shit')).toBe('invalid-argument')
		})

		it.each([
			['Cox', 'a top-1000 US surname'],
			['Wang', 'one of the most common surnames in the world'],
			['Butt', 'a common South Asian surname'],
			['Schaffer', 'a common German surname'],
			['Dick', 'a surname and a given name'],
			['Dyke', 'a surname'],
			['Kuntz', 'a German surname'],
			['Hoare', 'an English surname'],
			['Gaylord', 'a surname and a given name'],
			['Fanny', 'a given name'],
			['Schmuck', 'a German surname'],
			['Lipshitz', 'a surname'],
		])('accepts %s, %s', (name) => {
			// The blocklist ships with all of these. Refusing them tells
			// someone their legal name is unacceptable, and a server-side
			// rejection is the last word on it.
			expect(validateAndNormalizeName(name, 'Last name')).toBe(name)
		})

		it('still rejects an obscenity that is not a name', () => {
			expect(codeOf('Fuck')).toBe('invalid-argument')
		})

		it('tells someone with a real name how to proceed', () => {
			// The list cannot cover every surname, so the error has to lead
			// somewhere rather than just refusing.
			try {
				validateAndNormalizeName('Shit', 'Last name')
				expect.unreachable('should have thrown')
			} catch (error) {
				expect((error as Error).message).toMatch(/contact the league/i)
			}
		})

		it('skips the check when the caller opts out', () => {
			// Admin edits take this path: an organizer typing a name
			// deliberately overrides a filter that cannot know every surname.
			expect(
				validateAndNormalizeName('Shit', 'Last name', {
					checkProfanity: false,
				})
			).toBe('Shit')
		})

		it('still applies the structural rules when profanity is skipped', () => {
			expect(() =>
				validateAndNormalizeName('a'.repeat(51), 'Last name', {
					checkProfanity: false,
				})
			).toThrow()
		})
	})

	it('names the field in the error so a client can point at it', () => {
		try {
			validateAndNormalizeName('', 'Last name')
			expect.unreachable('should have thrown')
		} catch (error) {
			expect((error as Error).message).toContain('Last name')
		}
	})
})
