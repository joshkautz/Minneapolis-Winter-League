import { describe, expect, it } from 'vitest'
import { isStaleDeploymentError } from './stale-deployment'

/**
 * This detection is the only thing standing between a routine deploy and a
 * red "Something went wrong" screen for everyone with a tab already open.
 * Browsers word the failure differently and none of them give it a code, so
 * the messages below are transcribed from each engine and are the real
 * contract — a browser update that rewords one silently reverts the fix.
 */

describe('isStaleDeploymentError', () => {
	it.each([
		[
			'Chrome and Edge',
			'Failed to fetch dynamically imported module: https://mplswinterleague.com/assets/schedule-CPyrQfwJ.js',
		],
		[
			'Firefox',
			'error loading dynamically imported module: https://mplswinterleague.com/assets/schedule-CPyrQfwJ.js',
		],
		['Safari', 'Importing a module script failed.'],
		[
			'a failed stylesheet preload',
			'Unable to preload CSS for /assets/schedule-BqL2x9.css',
		],
	])('recognises the %s message', (_engine, message) => {
		expect(isStaleDeploymentError(new Error(message))).toBe(true)
	})

	it('recognises a ChunkLoadError by name even with an unfamiliar message', () => {
		const error = new Error('Loading chunk 42 failed.')
		error.name = 'ChunkLoadError'

		expect(isStaleDeploymentError(error)).toBe(true)
	})

	it('ignores case, so a reworded message still matches', () => {
		expect(
			isStaleDeploymentError(
				new Error('FAILED TO FETCH DYNAMICALLY IMPORTED MODULE: /assets/a.js')
			)
		).toBe(true)
	})

	it.each([
		[
			'a render fault',
			new Error("Cannot read properties of undefined (reading 'map')"),
		],
		['a failed API call', new Error('Failed to fetch')],
		['a permission error', new Error('Missing or insufficient permissions.')],
	])('does not claim %s is a stale deployment', (_label, error) => {
		expect(isStaleDeploymentError(error)).toBe(false)
	})

	it('does not match a bare network failure', () => {
		// 'Failed to fetch' is a substring of the Chrome message but means
		// something else entirely — a dead API, not a dead chunk. Treating it
		// as a stale deployment would tell people to refresh when refreshing
		// changes nothing.
		expect(isStaleDeploymentError(new TypeError('Failed to fetch'))).toBe(false)
	})

	it.each([
		['null', null],
		['undefined', undefined],
		['an empty string', ''],
	])('returns false for %s', (_label, value) => {
		expect(isStaleDeploymentError(value)).toBe(false)
	})

	it('handles a thrown value that is not an Error', () => {
		expect(
			isStaleDeploymentError(
				'Failed to fetch dynamically imported module: /assets/a.js'
			)
		).toBe(true)
	})
})
