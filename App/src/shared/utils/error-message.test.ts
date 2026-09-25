import { describe, expect, it } from 'vitest'
import { FirebaseError } from 'firebase/app'
import { errorCode, errorMessage } from './error-message'

const FALLBACK = 'Your team could not be created.'

/** What the Functions SDK throws for a callable's HttpsError. */
const callableError = (code: string, message: string): FirebaseError =>
	new FirebaseError(`functions/${code}`, message)

describe('errorMessage', () => {
	it('shows a callable refusal exactly as the server wrote it', () => {
		expect(
			errorMessage(
				callableError(
					'failed-precondition',
					'Team registration has closed. Registration ended Oct 31.'
				),
				FALLBACK
			)
		).toBe('Team registration has closed. Registration ended Oct 31.')
	})

	it('shows a clear internal message the server chose', () => {
		expect(
			errorMessage(
				callableError(
					'internal',
					'The logo could not be saved, so nothing was changed. Please try again.'
				),
				FALLBACK
			)
		).toBe(
			'The logo could not be saved, so nothing was changed. Please try again.'
		)
	})

	it('falls back when the server crashed without a message', () => {
		// An uncaught error in a callable reaches the App as "INTERNAL".
		expect(errorMessage(callableError('internal', 'INTERNAL'), FALLBACK)).toBe(
			FALLBACK
		)
		expect(errorMessage(callableError('internal', 'internal'), FALLBACK)).toBe(
			FALLBACK
		)
	})

	it('explains a callable that never reached the server', () => {
		expect(
			errorMessage(callableError('unavailable', 'unavailable'), FALLBACK)
		).toMatch(/could not reach the server/)
		expect(
			errorMessage(
				callableError('deadline-exceeded', 'deadline-exceeded'),
				FALLBACK
			)
		).toMatch(/took too long/)
	})

	it.each([
		['auth/invalid-credential', /do not match an account/],
		['auth/wrong-password', /do not match an account/],
		['auth/email-already-in-use', /already exists/],
		['auth/too-many-requests', /Wait a few minutes/],
		['auth/network-request-failed', /could not reach the server/],
		['auth/requires-recent-login', /sign out and back in/],
	])('translates %s', (code, expected) => {
		const error = new FirebaseError(code, `Firebase: Error (${code}).`)
		expect(errorMessage(error, FALLBACK)).toMatch(expected)
	})

	it('never shows Auth’s own text for a code it does not know', () => {
		const error = new FirebaseError(
			'auth/something-new',
			'Firebase: Error (auth/something-new).'
		)
		expect(errorMessage(error, FALLBACK)).toBe(FALLBACK)
	})

	it('translates Firestore codes and hides their messages', () => {
		expect(
			errorMessage(
				new FirebaseError(
					'permission-denied',
					'Missing or insufficient permissions.'
				),
				FALLBACK
			)
		).toBe('You do not have access to this.')
		expect(
			errorMessage(
				new FirebaseError(
					'failed-precondition',
					'The query requires an index.'
				),
				FALLBACK
			)
		).toBe(FALLBACK)
	})

	it('explains a failed fetch as a connection problem', () => {
		expect(errorMessage(new TypeError('Failed to fetch'), FALLBACK)).toMatch(
			/Check your internet connection/
		)
	})

	it('keeps an App error written for people', () => {
		expect(errorMessage(new Error('No team selected'), FALLBACK)).toBe(
			'No team selected'
		)
	})

	it('replaces technical text and non-errors with the fallback', () => {
		expect(
			errorMessage(
				new TypeError("Cannot read properties of undefined (reading 'id')"),
				FALLBACK
			)
		).toBe(FALLBACK)
		expect(errorMessage(undefined, FALLBACK)).toBe(FALLBACK)
		expect(errorMessage({ weird: true }, FALLBACK)).toBe(FALLBACK)
	})
})

describe('errorCode', () => {
	it('drops the callable prefix', () => {
		expect(errorCode(callableError('not-found', 'x'))).toBe('not-found')
		expect(errorCode(new FirebaseError('auth/x', 'y'))).toBe('auth/x')
		expect(errorCode(new Error('plain'))).toBeUndefined()
	})
})
