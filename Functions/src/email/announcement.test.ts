import { describe, expect, it } from 'vitest'
import {
	describeGameNights,
	gameNightsOf,
	thanksgivingSaturday,
} from './announcement.js'

const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`)
const isoDays = (dates: Date[]): string[] =>
	dates.map((date) => date.toISOString().slice(0, 10))

describe('thanksgivingSaturday', () => {
	it.each([
		// Thanksgiving is the fourth Thursday of November, whatever weekday
		// November starts on.
		[2025, '2025-11-29'],
		[2026, '2026-11-28'],
		[2027, '2027-11-27'],
		[2029, '2029-11-24'], // November starts on a Thursday
		[2030, '2030-11-30'], // November starts on a Friday
	])('is the Saturday after Thanksgiving in %i', (year, expected) => {
		const saturday = thanksgivingSaturday(year)
		expect(saturday.toISOString().slice(0, 10)).toBe(expected)
		expect(saturday.getUTCDay()).toBe(6)
	})
})

describe('gameNightsOf', () => {
	it('gives 2026 Fall the six nights the home page lists', () => {
		// The season as stored: Minneapolis midnight on November 7 through
		// midnight on December 20, across the November DST change.
		const { nights, skipsThanksgiving } = gameNightsOf(
			new Date('2026-11-07T06:00:00Z'),
			new Date('2026-12-20T06:00:00Z')
		)

		expect(isoDays(nights)).toEqual([
			'2026-11-07',
			'2026-11-14',
			'2026-11-21',
			'2026-12-05',
			'2026-12-12',
			'2026-12-19',
		])
		expect(skipsThanksgiving).toBe(true)
	})

	it('counts the last day when it is a Saturday', () => {
		const { nights } = gameNightsOf(
			new Date('2026-12-05T06:00:00Z'),
			new Date('2026-12-19T06:00:00Z')
		)
		expect(isoDays(nights)).toEqual(['2026-12-05', '2026-12-12', '2026-12-19'])
	})

	it('reads days on Minneapolis’s calendar, not UTC’s', () => {
		// 11pm Friday in Minneapolis is already Saturday in UTC.
		const { nights } = gameNightsOf(
			new Date('2026-12-05T05:00:00Z'),
			new Date('2026-12-05T05:30:00Z')
		)
		expect(nights).toEqual([])
	})

	it('skips nothing when Thanksgiving falls outside the season', () => {
		const { nights, skipsThanksgiving } = gameNightsOf(
			new Date('2027-01-02T06:00:00Z'),
			new Date('2027-01-17T06:00:00Z')
		)
		expect(isoDays(nights)).toEqual(['2027-01-02', '2027-01-09', '2027-01-16'])
		expect(skipsThanksgiving).toBe(false)
	})
})

describe('describeGameNights', () => {
	it('groups nights by month', () => {
		expect(
			describeGameNights([
				day('2026-11-07'),
				day('2026-11-14'),
				day('2026-11-21'),
				day('2026-12-05'),
				day('2026-12-12'),
				day('2026-12-19'),
			])
		).toBe('November 7, 14 and 21, and December 5, 12 and 19')
	})

	it.each([
		[['2026-11-07'], 'November 7'],
		[['2026-11-07', '2026-11-14'], 'November 7 and 14'],
		[['2026-11-28', '2026-12-05'], 'November 28, and December 5'],
		[
			['2026-12-19', '2027-01-02', '2027-02-06'],
			'December 19, January 2, and February 6',
		],
	])('describes %j as "%s"', (dates, expected) => {
		expect(describeGameNights(dates.map(day))).toBe(expected)
	})
})
