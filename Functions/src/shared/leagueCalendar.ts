/**
 * Days on Minneapolis's calendar: the game nights, the Thanksgiving break,
 * and the dates badges and emails name.
 */

import { FIREBASE_CONFIG } from '../config/constants.js'

const SATURDAY = 6
const THURSDAY = 4
const NOVEMBER = 10
export const DAY_MS = 24 * 60 * 60 * 1000

/** The calendar day an instant falls on in Minneapolis, as UTC midnight. */
export const leagueCalendarDay = (instant: Date): Date => {
	const parts = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		timeZone: FIREBASE_CONFIG.TIME_ZONE,
	}).formatToParts(instant)
	const part = (type: Intl.DateTimeFormatPartTypes): number =>
		Number(parts.find((p) => p.type === type)?.value)
	return new Date(Date.UTC(part('year'), part('month') - 1, part('day')))
}

/** "2026-11-14": the Minneapolis day an instant falls on, for grouping. */
export const leagueDayKey = (instant: Date): string =>
	leagueCalendarDay(instant).toISOString().slice(0, 10)

/** "November 14", on Minneapolis's calendar. */
export const leagueMonthDay = (instant: Date): string =>
	new Intl.DateTimeFormat('en-US', {
		month: 'long',
		day: 'numeric',
		timeZone: FIREBASE_CONFIG.TIME_ZONE,
	}).format(instant)

/** The Saturday after Thanksgiving (the fourth Thursday of November). */
export const thanksgivingSaturday = (year: number): Date => {
	const firstWeekday = new Date(Date.UTC(year, NOVEMBER, 1)).getUTCDay()
	const firstThursday = 1 + ((THURSDAY - firstWeekday + 7) % 7)
	return new Date(Date.UTC(year, NOVEMBER, firstThursday + 21 + 2))
}

/** Whether a calendar day (as UTC midnight) is a Saturday. */
export const isSaturday = (day: Date): boolean => day.getUTCDay() === SATURDAY
