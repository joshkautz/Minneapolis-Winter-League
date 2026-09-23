import { afterEach, describe, expect, it } from 'vitest'
import { isAllowedReturnUrl } from './returnUrls.js'

/**
 * Stripe sends the payer to whatever return URL it is given, so an
 * unchecked one turns a genuine checkout page into a redirect to anywhere.
 */

describe('isAllowedReturnUrl', () => {
	afterEach(() => {
		delete process.env.FUNCTIONS_EMULATOR
	})

	it.each([
		'https://mplswinterleague.com/profile?payment=success',
		'https://www.mplswinterleague.com/teams/abc',
		'https://minnesota-winter-league.web.app/',
		'https://minnesota-winter-league.firebaseapp.com/profile',
		'https://minnesota-winter-league--pr1407-abc123de.web.app/profile',
	])('accepts %s', (url) => {
		expect(isAllowedReturnUrl(url)).toBe(true)
	})

	it.each([
		['another site', 'https://evil.example/profile'],
		['a lookalike subdomain', 'https://mplswinterleague.com.evil.example/'],
		['a lookalike suffix', 'https://evilmplswinterleague.com/'],
		['plain http', 'http://mplswinterleague.com/'],
		[
			'a preview channel over plain http',
			'http://minnesota-winter-league--pr1-abc.web.app/',
		],
		['a non-standard port', 'https://mplswinterleague.com:8443/'],
		[
			'credentials in the authority',
			'https://mplswinterleague.com@evil.example/',
		],
		['credentials on our own host', 'https://user:pw@mplswinterleague.com/'],
		['a javascript: URL', 'javascript:alert(1)'],
		['a data: URL', 'data:text/html,hello'],
		['a relative path', '/profile'],
		['a protocol-relative URL', '//evil.example/'],
		[
			'another project’s preview channel',
			'https://other-project--pr1-abc.web.app/',
		],
		[
			'a preview channel on another port',
			'https://minnesota-winter-league--pr1-abc.web.app:444/',
		],
		[
			'a preview channel under a subdomain',
			'https://x.minnesota-winter-league--pr1-abc.web.app/',
		],
		['an empty string', ''],
		['not a string', 42],
		['undefined', undefined],
	])('rejects %s', (_label, url) => {
		expect(isAllowedReturnUrl(url)).toBe(false)
	})

	describe('local development', () => {
		it('rejects localhost outside the emulator', () => {
			// A deployed function must never redirect a real payment to
			// whatever happens to be listening on the payer's machine.
			expect(isAllowedReturnUrl('http://localhost:5173/')).toBe(false)
			expect(isAllowedReturnUrl('http://127.0.0.1:5173/')).toBe(false)
		})

		it('accepts localhost under the Functions emulator', () => {
			process.env.FUNCTIONS_EMULATOR = 'true'
			expect(isAllowedReturnUrl('http://localhost:5173/profile')).toBe(true)
			expect(isAllowedReturnUrl('http://127.0.0.1:5173/profile')).toBe(true)
		})

		it('still rejects other hosts under the emulator', () => {
			process.env.FUNCTIONS_EMULATOR = 'true'
			expect(isAllowedReturnUrl('http://evil.example/')).toBe(false)
			expect(isAllowedReturnUrl('http://localhost.evil.example/')).toBe(false)
		})
	})
})
