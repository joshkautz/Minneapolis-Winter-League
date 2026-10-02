import { describe, expect, it } from 'vitest'
import { leagueInstant, leagueNights } from './leagueCalendar.js'

/** Minneapolis midnight, as the season documents store their dates. */
const midnight = (day: string, offsetHours = 6): Date =>
	new Date(`${day}T${String(offsetHours).padStart(2, '0')}:00:00Z`)

const days = (nights: Date[]): string[] =>
	nights.map((night) => night.toISOString().slice(0, 10))

describe('leagueNights', () => {
	it('gives Season 5 its six nights, skipping the Saturday after Thanksgiving', () => {
		expect(
			days(leagueNights(midnight('2026-11-07'), midnight('2026-12-20')))
		).toEqual([
			'2026-11-07',
			'2026-11-14',
			'2026-11-21',
			'2026-12-05',
			'2026-12-12',
			'2026-12-19',
		])
	})

	it('matches the nights Seasons 1 and 3 were played on', () => {
		expect(
			days(leagueNights(midnight('2023-11-04'), midnight('2023-12-17')))
		).toEqual([
			'2023-11-04',
			'2023-11-11',
			'2023-11-18',
			'2023-12-02',
			'2023-12-09',
			'2023-12-16',
		])
		expect(
			days(leagueNights(midnight('2025-11-01'), midnight('2025-12-21')))
		).toEqual([
			'2025-11-01',
			'2025-11-08',
			'2025-11-15',
			'2025-11-22',
			'2025-12-06',
			'2025-12-13',
			'2025-12-20',
		])
	})

	it('counts a Saturday the season starts or ends on', () => {
		expect(
			days(leagueNights(midnight('2027-03-06'), midnight('2027-03-13')))
		).toEqual(['2027-03-06', '2027-03-13'])
	})
})

describe('leagueInstant', () => {
	it('reads the time on Minneapolis’s clock in standard time', () => {
		expect(leagueInstant(new Date('2026-11-07T00:00:00Z'), '18:00')).toEqual(
			new Date('2026-11-08T00:00:00Z')
		)
		expect(leagueInstant(new Date('2026-12-19T00:00:00Z'), '20:15')).toEqual(
			new Date('2026-12-20T02:15:00Z')
		)
	})

	it('reads it in daylight time, either side of the spring change', () => {
		// Clocks went forward on 8 March 2026.
		expect(leagueInstant(new Date('2026-03-07T00:00:00Z'), '18:00')).toEqual(
			new Date('2026-03-08T00:00:00Z')
		)
		expect(leagueInstant(new Date('2026-03-14T00:00:00Z'), '18:00')).toEqual(
			new Date('2026-03-14T23:00:00Z')
		)
	})

	it('reads a time just after the clocks go forward', () => {
		// 3:30am on 8 March 2026 is CDT; the clock read as UTC is still CST.
		expect(leagueInstant(new Date('2026-03-08T00:00:00Z'), '03:30')).toEqual(
			new Date('2026-03-08T08:30:00Z')
		)
	})

	it('reads it on the day the clocks go back', () => {
		expect(leagueInstant(new Date('2026-11-01T00:00:00Z'), '18:45')).toEqual(
			new Date('2026-11-02T00:45:00Z')
		)
	})
})
