import { describe, expect, it } from 'vitest'
import { accountEmailMailId, leagueActionLink } from './accountEmails.js'
import { TEMPLATES } from './templates.js'

const FIREBASE_LINK =
	'https://minnesota-winter-league.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=CODE-123&apiKey=KEY&continueUrl=https%3A%2F%2Fexample.com&lang=en'

describe('leagueActionLink', () => {
	it('puts Firebase’s code on the league’s own page, and nothing else', () => {
		expect(
			leagueActionLink(
				FIREBASE_LINK,
				'passwordReset',
				'https://mplswinterleague.com'
			)
		).toBe(
			'https://mplswinterleague.com/auth/action?mode=resetPassword&oobCode=CODE-123'
		)
	})

	it('names the action by the email, whatever Firebase called it', () => {
		expect(
			leagueActionLink(
				FIREBASE_LINK,
				'emailVerification',
				'https://mplswinterleague.com'
			)
		).toContain('mode=verifyEmail')
	})

	it('reads the emulator’s links too', () => {
		expect(
			leagueActionLink(
				'http://127.0.0.1:9099/emulator/action?mode=verifyEmail&lang=en&oobCode=XYZ&apiKey=fake',
				'emailVerification',
				'http://localhost:5173'
			)
		).toBe('http://localhost:5173/auth/action?mode=verifyEmail&oobCode=XYZ')
	})

	it('refuses a link with no code rather than send a dead email', () => {
		expect(() =>
			leagueActionLink(
				'https://example.com/__/auth/action?mode=resetPassword',
				'passwordReset'
			)
		).toThrow('no code')
	})
})

describe('accountEmailMailId', () => {
	it('names each send apart, and each account and kind of email', () => {
		const now = new Date('2026-10-28T14:01:56Z')
		expect(accountEmailMailId('emailVerification', 'u1', now)).toBe(
			`emailVerification-u1-${now.getTime()}`
		)
		expect(accountEmailMailId('passwordReset', 'u1', now)).not.toBe(
			accountEmailMailId('emailVerification', 'u1', now)
		)
	})
})

describe('the account emails', () => {
	it('cannot be turned off, and keep their link out of the outbox', () => {
		for (const name of ['emailVerification', 'passwordReset'] as const) {
			expect(TEMPLATES[name].category).toBe('account')
			expect(TEMPLATES[name].secretProps).toEqual(['link'])
		}
	})
})
