import { describe, expect, it } from 'vitest'
import { daysInWords, seasonFacts } from './season-facts'

/** Season 5, as stored: Minneapolis midnights. */
const SEASON_5 = seasonFacts(
	new Date('2026-11-07T06:00:00Z'),
	new Date('2026-12-20T06:00:00Z')
)

describe('seasonFacts', () => {
	it('finds Season 5’s six nights and its Thanksgiving break', () => {
		expect(SEASON_5.nights).toHaveLength(6)
		expect(SEASON_5.breaks.map((d) => d.toISOString().slice(0, 10))).toEqual([
			'2026-11-28',
		])
	})
})

describe('daysInWords', () => {
	it('names each month once', () => {
		expect(daysInWords(SEASON_5.nights)).toBe(
			'November 7th, 14th, 21st and December 5th, 12th, 19th'
		)
		expect(daysInWords(SEASON_5.breaks)).toBe('November 28th')
	})

	it('says nothing for no days', () => {
		expect(daysInWords([])).toBe('')
	})
})
