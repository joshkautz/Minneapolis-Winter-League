import { describe, expect, it } from 'vitest'
import { isGameField, parseGameKickoff } from './gameSchedule.js'

describe('parseGameKickoff', () => {
	it('accepts each Saturday slot and returns the exact instant', () => {
		for (const slot of ['18:00', '18:45', '19:30', '20:15']) {
			const timestamp = `2026-11-07T${slot}:00.000-06:00`
			expect(parseGameKickoff(timestamp).toISOString()).toBe(
				new Date(timestamp).toISOString()
			)
		}
	})

	it('reads the day as written, though the UTC instant is already Sunday', () => {
		// 8:15pm CST is 02:15 UTC on Sunday.
		const kickoff = parseGameKickoff('2026-11-07T20:15:00.000-06:00')
		expect(kickoff.getUTCDay()).toBe(0)
	})

	it('keeps a slot the same slot either side of the DST change', () => {
		// 1 November 2026 ends daylight saving time in Central.
		expect(() =>
			parseGameKickoff('2026-10-31T18:00:00.000-05:00')
		).not.toThrow()
		expect(() =>
			parseGameKickoff('2026-11-07T18:00:00.000-06:00')
		).not.toThrow()
	})

	it('rejects a day other than Saturday', () => {
		expect(() => parseGameKickoff('2026-11-08T18:00:00.000-06:00')).toThrow(
			'Games can only be scheduled on Saturdays (received 2026-11-08)'
		)
	})

	it('rejects a time outside the slots', () => {
		expect(() => parseGameKickoff('2026-11-07T18:30:00.000-06:00')).toThrow(
			'(received: 18:30)'
		)
	})

	it('rejects a string that is not a timestamp', () => {
		const badOffset = '2026-11-07T18:00:00.000-99:99'
		for (const timestamp of ['', 'next Saturday', '2026-11-07', badOffset]) {
			expect(() => parseGameKickoff(timestamp)).toThrow(
				'Invalid timestamp format'
			)
		}
	})

	it('reports every rejection as invalid-argument', () => {
		expect(() => parseGameKickoff('nope')).toThrow(
			expect.objectContaining({ code: 'invalid-argument' })
		)
	})
})

describe('isGameField', () => {
	it('accepts fields 1 to 3 only', () => {
		expect([1, 2, 3].every(isGameField)).toBe(true)
		expect([0, 4, '1', null, undefined].some(isGameField)).toBe(false)
	})
})
