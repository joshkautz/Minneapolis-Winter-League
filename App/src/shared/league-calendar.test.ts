import { describe, expect, it } from 'vitest'
import { leagueTimeIso, leagueNights } from './league-calendar'

/** The App loads the server's calendar, imports and all. */
describe('league calendar in the App', () => {
	it('reads the same nights and kickoffs as the server', () => {
		expect(
			leagueNights(
				new Date('2026-11-07T06:00:00Z'),
				new Date('2026-12-20T06:00:00Z')
			)
		).toHaveLength(6)
		expect(leagueTimeIso('2026-11-07', '18:00')).toBe(
			'2026-11-07T18:00:00.000-06:00'
		)
	})
})
