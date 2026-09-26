import { describe, expect, it } from 'vitest'
import {
	emailSchema,
	nameSchema,
	passwordSchema,
	teamNameSchema,
	loginFormSchema,
	signupFormSchema,
} from './validation'

/**
 * These schemas are the only validation a user's input meets before it
 * reaches a callable, and several of them transform as well as validate —
 * emails are lowercased, names are title-cased. A silent change to either
 * behaviour would alter what gets written to Firestore.
 */

describe('emailSchema', () => {
	it('accepts a well-formed address', () => {
		expect(emailSchema.parse('player@example.com')).toBe('player@example.com')
	})

	it('lowercases the address, which is what gets stored', () => {
		expect(emailSchema.parse('Player@Example.COM')).toBe('player@example.com')
	})

	it('trims a pasted address rather than rejecting it', () => {
		// The chain runs in order. With .email() first, a pasted
		// "  a@b.com  " was reported as a malformed address.
		expect(emailSchema.parse('  player@example.com  ')).toBe(
			'player@example.com'
		)
	})

	it('still rejects an address whose interior is malformed, after trimming', () => {
		expect(emailSchema.safeParse('  not an email  ').success).toBe(false)
	})

	it.each([
		['missing @', 'not-an-email'],
		['no domain', 'player@'],
		['no local part', '@example.com'],
		['empty', ''],
	])('rejects %s', (_label, input) => {
		expect(emailSchema.safeParse(input).success).toBe(false)
	})
})

describe('passwordSchema', () => {
	it('accepts a password meeting every rule', () => {
		expect(passwordSchema.safeParse('Winter2026').success).toBe(true)
	})

	it.each([
		['under 8 characters', 'Short1a'],
		['no uppercase', 'winter2026'],
		['no lowercase', 'WINTER2026'],
		['no digit', 'WinterLeague'],
	])('rejects a password with %s', (_label, input) => {
		expect(passwordSchema.safeParse(input).success).toBe(false)
	})

	it('rejects common passwords even when they satisfy the character rules', () => {
		// "Password1" would otherwise pass every regex above.
		expect(passwordSchema.safeParse('password').success).toBe(false)
		expect(passwordSchema.safeParse('12345678').success).toBe(false)
		expect(passwordSchema.safeParse('qwerty123').success).toBe(false)
	})

	it('matches common passwords case-insensitively', () => {
		expect(passwordSchema.safeParse('PASSWORD').success).toBe(false)
	})
})

describe('nameSchema', () => {
	it('title-cases each word', () => {
		expect(nameSchema.parse('josh kautz')).toBe('Josh Kautz')
	})

	it('collapses runs of spaces instead of rejecting them', () => {
		// A double-typed or pasted space is a typo, not a malformed name.
		expect(nameSchema.parse('josh   kautz')).toBe('Josh Kautz')
	})

	it('collapses tabs and newlines in a pasted name', () => {
		expect(nameSchema.parse('josh\tkautz')).toBe('Josh Kautz')
	})

	it('still rejects consecutive apostrophes', () => {
		expect(nameSchema.safeParse("o''brien").success).toBe(false)
	})

	it('accepts hyphens and apostrophes', () => {
		expect(nameSchema.parse("mary-jane o'brien")).toBe("Mary-Jane O'Brien")
	})

	it.each([
		['a single character', 'J'],
		['digits', 'Player 1'],
		['symbols', 'Josh@Kautz'],
		['consecutive hyphens', 'Josh--Kautz'],
	])('rejects %s', (_label, input) => {
		expect(nameSchema.safeParse(input).success).toBe(false)
	})

	it('rejects a name longer than 50 characters', () => {
		expect(nameSchema.safeParse('a'.repeat(51)).success).toBe(false)
	})

	describe('names that are not plain ASCII', () => {
		it('accepts a curly apostrophe and stores a straight one', () => {
			// What iOS and macOS type by default. Two players in this league
			// are stored with one, and the form used to refuse them.
			expect(nameSchema.parse('o\u2019dowd')).toBe("O'Dowd")
		})

		it.each(['Jos\u00e9', 'M\u00fcller', 'Nguy\u1ec5n'])(
			'accepts %s',
			(name) => {
				expect(nameSchema.safeParse(name).success).toBe(true)
			}
		)

		it('capitalizes a non-ASCII first letter', () => {
			expect(nameSchema.parse('\u00e9lodie')).toBe('\u00c9lodie')
		})

		it('still rejects quote marks', () => {
			expect(nameSchema.safeParse('Hayden \u201cSlotz\u201d').success).toBe(
				false
			)
		})
	})

	it('rejects an obscenity', () => {
		expect(nameSchema.safeParse('Shit').success).toBe(false)
	})

	it.each(['Cox', 'Wang', 'Butt', 'Schaffer', 'Dick', 'Dyke', 'Hoare'])(
		'accepts %s, which is a real surname the blocklist ships with',
		(name) => {
			// The form refused to let anyone with these names register. Cox is
			// a top-1000 US surname and Wang is one of the most common in the
			// world. The exceptions are the server's, from `@/shared/name-rules`.
			expect(nameSchema.parse(name)).toBe(name)
		}
	)
})

describe('teamNameSchema', () => {
	it('accepts an ordinary team name', () => {
		expect(teamNameSchema.parse('  Mounds View Marlins  ')).toBe(
			'Mounds View Marlins'
		)
	})

	it('allows digits and punctuation that nameSchema rejects', () => {
		// Team names are deliberately laxer than person names.
		expect(teamNameSchema.safeParse('Team 99!').success).toBe(true)
	})

	it('rejects profanity', () => {
		expect(teamNameSchema.safeParse('shit happens').success).toBe(false)
	})

	it('rejects names outside the length bounds', () => {
		expect(teamNameSchema.safeParse('A').success).toBe(false)
		expect(teamNameSchema.safeParse('a'.repeat(51)).success).toBe(false)
	})
})

describe('form schemas', () => {
	it('loginFormSchema does not apply the strict password rules', () => {
		// Existing accounts may predate the current policy; logging in must
		// not be blocked by it.
		expect(
			loginFormSchema.safeParse({ email: 'a@example.com', password: 'old' })
				.success
		).toBe(true)
	})

	it('signupFormSchema does apply them', () => {
		expect(
			signupFormSchema.safeParse({
				email: 'a@example.com',
				password: 'old',
				firstname: 'Josh',
				lastname: 'Kautz',
			}).success
		).toBe(false)
	})
})
