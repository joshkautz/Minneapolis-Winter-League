import { describe, expect, it } from 'vitest'
import { formatPlacement, ordinal } from './placement'

describe('ordinal', () => {
	it.each([
		[1, '1st'],
		[2, '2nd'],
		[3, '3rd'],
		[4, '4th'],
		[11, '11th'],
		[12, '12th'],
		[13, '13th'],
		[21, '21st'],
		[22, '22nd'],
		[23, '23rd'],
		[101, '101st'],
		[111, '111th'],
		[112, '112th'],
	])('writes %i as %s', (position, expected) => {
		expect(ordinal(position)).toBe(expected)
	})
})

describe('formatPlacement', () => {
	it('gives the top three a medal', () => {
		expect(formatPlacement(1)).toBe('1st 🥇')
		expect(formatPlacement(2)).toBe('2nd 🥈')
		expect(formatPlacement(3)).toBe('3rd 🥉')
	})

	it('writes the rest as plain ordinals', () => {
		expect(formatPlacement(4)).toBe('4th')
		expect(formatPlacement(11)).toBe('11th')
	})

	it('shows an unplayed season as TBD', () => {
		expect(formatPlacement(null)).toBe('TBD')
	})
})
