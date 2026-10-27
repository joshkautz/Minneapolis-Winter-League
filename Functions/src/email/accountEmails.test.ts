import { describe, expect, it } from 'vitest'
import {
	ACCOUNT_EMAIL_INTERVAL_MS,
	accountEmailMailId,
	leagueActionLink,
} from './accountEmails.js'
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
	it('is the same within a window, so a second request sends nothing new', () => {
		const start = new Date(10 * ACCOUNT_EMAIL_INTERVAL_MS)
		const later = new Date(start.getTime() + ACCOUNT_EMAIL_INTERVAL_MS - 1)
		const next = new Date(start.getTime() + ACCOUNT_EMAIL_INTERVAL_MS)

		expect(accountEmailMailId('passwordReset', 'u1', later)).toBe(
			accountEmailMailId('passwordReset', 'u1', start)
		)
		expect(accountEmailMailId('passwordReset', 'u1', next)).not.toBe(
			accountEmailMailId('passwordReset', 'u1', start)
		)
	})

	it('keeps each account and each kind of email apart', () => {
		const now = new Date()
		expect(accountEmailMailId('passwordReset', 'u1', now)).not.toBe(
			accountEmailMailId('passwordReset', 'u2', now)
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
