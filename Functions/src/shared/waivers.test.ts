import { describe, expect, it } from 'vitest'
import { describeDropboxSignError } from './waivers.js'

/**
 * The Dropbox Sign SDK throws "HTTP request failed" for every error, so
 * that is all the logs used to show. In September 2026 every production
 * waiver failed with exactly that, and the reason — the account had no API
 * quota — was only visible by asking Dropbox Sign directly.
 */
describe('describeDropboxSignError', () => {
	it("includes the status and Dropbox Sign's own reason", () => {
		const error = Object.assign(new Error('HTTP request failed'), {
			statusCode: 403,
			body: {
				error: { errorName: 'forbidden', errorMsg: 'No API quota left' },
			},
		})

		expect(describeDropboxSignError(error)).toBe(
			'403 forbidden No API quota left'
		)
	})

	it('falls back to the status and message when there is no body', () => {
		const error = Object.assign(new Error('HTTP request failed'), {
			statusCode: 500,
		})

		expect(describeDropboxSignError(error)).toBe('500 HTTP request failed')
	})

	it('passes an ordinary error through', () => {
		expect(describeDropboxSignError(new Error('socket hang up'))).toBe(
			'socket hang up'
		)
	})

	it('handles something that is not an error', () => {
		expect(describeDropboxSignError('boom')).toBe('Unknown error')
	})
})
