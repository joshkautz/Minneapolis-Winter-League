import { describe, expect, it } from 'vitest'
import { requireText, TEXT_RULES } from './textFields.js'

describe('requireText', () => {
	it('returns the trimmed text', () => {
		expect(requireText('  Hello there  ', TEXT_RULES.newsTitle)).toBe(
			'Hello there'
		)
	})

	it('measures the trimmed text against the bounds', () => {
		expect(() => requireText('  ab   ', TEXT_RULES.newsTitle)).toThrow(
			'Title must be at least 3 characters long.'
		)
		expect(() =>
			requireText('x'.repeat(2_001), TEXT_RULES.postContent)
		).toThrow('Post content must not exceed 2,000 characters.')
		expect(requireText('x'.repeat(2_000), TEXT_RULES.postContent)).toHaveLength(
			2_000
		)
	})

	it('names a missing field', () => {
		for (const value of [undefined, null, 42, '   ']) {
			expect(() => requireText(value, TEXT_RULES.badgeName)).toThrow(
				'Name is required.'
			)
		}
	})

	it('refuses with invalid-argument', () => {
		expect(() => requireText('', TEXT_RULES.replyContent)).toThrow(
			expect.objectContaining({ code: 'invalid-argument' })
		)
	})
})
