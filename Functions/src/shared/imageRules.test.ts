import { describe, expect, it } from 'vitest'
import {
	ALLOWED_IMAGE_TYPES,
	MAX_IMAGE_BYTES,
	formatMegabytes,
	imageProblem,
} from './imageRules.js'

describe('imageProblem', () => {
	it('accepts every allowed type up to the limit', () => {
		for (const contentType of ALLOWED_IMAGE_TYPES) {
			expect(
				imageProblem({ sizeBytes: MAX_IMAGE_BYTES, contentType }, 'The logo')
			).toBeNull()
		}
	})

	it('refuses an image one byte over the limit, saying how big it is', () => {
		expect(
			imageProblem(
				{ sizeBytes: MAX_IMAGE_BYTES + 1, contentType: 'image/png' },
				'The logo'
			)
		).toBe(
			'The logo is 5.0 MB, and the limit is 5.0 MB. Choose a smaller image, or resize this one and try again.'
		)
	})

	it('names the size of a much larger image', () => {
		expect(
			imageProblem(
				{ sizeBytes: 12 * 1024 * 1024, contentType: 'image/jpeg' },
				'The badge image'
			)
		).toMatch(/^The badge image is 12\.0 MB/)
	})

	it('refuses SVG, which can carry script', () => {
		expect(
			imageProblem({ sizeBytes: 10, contentType: 'image/svg+xml' }, 'The logo')
		).toBe('The logo must be a PNG, JPEG, GIF or WebP image.')
	})

	it('refuses a file that is not an image', () => {
		expect(
			imageProblem({ sizeBytes: 10, contentType: 'text/html' }, 'The logo')
		).toMatch(/must be a PNG/)
	})

	it('refuses an empty file', () => {
		expect(
			imageProblem({ sizeBytes: 0, contentType: 'image/png' }, 'The logo')
		).toBe('The logo is an empty file. Choose another image.')
	})
})

describe('formatMegabytes', () => {
	it('rounds to one decimal place', () => {
		expect(formatMegabytes(7.34 * 1024 * 1024)).toBe('7.3 MB')
	})
})
