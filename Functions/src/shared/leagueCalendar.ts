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

/** The calendar days a season's games are played on, as UTC midnights. */
export const leagueNights = (dateStart: Date, dateEnd: Date): Date[] => {
	const nights: Date[] = []
	const last = leagueCalendarDay(dateEnd).getTime()
	for (
		let day = leagueCalendarDay(dateStart).getTime();
		day <= last;
		day += DAY_MS
	) {
		const night = new Date(day)
		// The league takes the Saturday after Thanksgiving off.
		if (
			isSaturday(night) &&
			day !== thanksgivingSaturday(night.getUTCFullYear()).getTime()
		) {
			nights.push(night)
		}
	}
	return nights
}

/** How far Minneapolis's clock is from UTC at an instant, in milliseconds. */
const minneapolisOffsetMs = (instant: Date): number => {
	const parts = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric',
		hourCycle: 'h23',
		timeZone: FIREBASE_CONFIG.TIME_ZONE,
	}).formatToParts(instant)
	const part = (type: Intl.DateTimeFormatPartTypes): number =>
		Number(parts.find((p) => p.type === type)?.value)
	const asUtc = Date.UTC(
		part('year'),
		part('month') - 1,
		part('day'),
		part('hour'),
		part('minute'),
		part('second')
	)
	return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/**
 * The instant a Minneapolis wall-clock time ("18:45") falls at on a
 * calendar day (as UTC midnight), either side of a daylight-saving change.
 */
export const leagueInstant = (day: Date, time: string): Date => {
	const [hours, minutes] = time.split(':').map(Number)
	const wallClock = Date.UTC(
		day.getUTCFullYear(),
		day.getUTCMonth(),
		day.getUTCDate(),
		hours,
		minutes
	)
	// The offset at the wall-clock reading is right except within hours of a
	// change; taking it again at the first guess settles it.
	const guess = wallClock - minneapolisOffsetMs(new Date(wallClock))
	return new Date(wallClock - minneapolisOffsetMs(new Date(guess)))
}
