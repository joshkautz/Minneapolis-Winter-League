import { describe, expect, it } from 'vitest'
import { GAME_TIMES_IN_WORDS, gameTimeLabel } from './gameRules.js'

describe('gameTimeLabel', () => {
	it('reads a kickoff on a twelve-hour clock', () => {
		expect(gameTimeLabel('18:00')).toBe('6:00pm')
		expect(gameTimeLabel('20:15')).toBe('8:15pm')
		expect(gameTimeLabel('12:05')).toBe('12:05pm')
		expect(gameTimeLabel('09:30')).toBe('9:30am')
	})
})

describe('GAME_TIMES_IN_WORDS', () => {
	it('lists every kickoff for a message', () => {
		expect(GAME_TIMES_IN_WORDS).toBe('6:00pm, 6:45pm, 7:30pm, or 8:15pm')
	})
})
