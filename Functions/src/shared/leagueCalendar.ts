/**
 * Days on Minneapolis's calendar: the game nights, the Thanksgiving break,
 * and the dates badges and emails name.
 *
 * The App imports this file for its game form and home page, so it may
 * import only `gameRules.ts`, which imports nothing.
 */

import { LEAGUE_TIME_ZONE } from './gameRules.js'

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
		timeZone: LEAGUE_TIME_ZONE,
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
		timeZone: LEAGUE_TIME_ZONE,
	}).format(instant)

/** The Saturday after Thanksgiving (the fourth Thursday of November). */
export const thanksgivingSaturday = (year: number): Date => {
	const firstWeekday = new Date(Date.UTC(year, NOVEMBER, 1)).getUTCDay()
	const firstThursday = 1 + ((THURSDAY - firstWeekday + 7) % 7)
	return new Date(Date.UTC(year, NOVEMBER, firstThursday + 21 + 2))
}

/** Whether a calendar day (as UTC midnight) is a Saturday. */
export const isSaturday = (day: Date): boolean => day.getUTCDay() === SATURDAY

/** Every Saturday of a season, its first and last days included, as UTC midnights. */
export const leagueSaturdays = (dateStart: Date, dateEnd: Date): Date[] => {
	const saturdays: Date[] = []
	const last = leagueCalendarDay(dateEnd).getTime()
	for (
		let day = leagueCalendarDay(dateStart).getTime();
		day <= last;
		day += DAY_MS
	) {
		if (isSaturday(new Date(day))) saturdays.push(new Date(day))
	}
	return saturdays
}

/**
 * The calendar days a season's games are played on, as UTC midnights: its
 * Saturdays, except the one after Thanksgiving, which the league takes off.
 */
export const leagueNights = (dateStart: Date, dateEnd: Date): Date[] =>
	leagueSaturdays(dateStart, dateEnd).filter(
		(night) =>
			night.getTime() !== thanksgivingSaturday(night.getUTCFullYear()).getTime()
	)

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
		timeZone: LEAGUE_TIME_ZONE,
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

/** "2026-11-07" and "18:45": an instant as Minneapolis's calendar and clock read it. */
export const leagueWallClock = (
	instant: Date
): { day: string; time: string } => {
	const parts = new Intl.DateTimeFormat('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
		timeZone: LEAGUE_TIME_ZONE,
	}).formatToParts(instant)
	const part = (type: Intl.DateTimeFormatPartTypes): string =>
		parts.find((p) => p.type === type)?.value ?? '00'
	return {
		day: leagueDayKey(instant),
		time: `${part('hour')}:${part('minute')}`,
	}
}

/**
 * A Minneapolis wall-clock time with that day's offset,
 * "2026-11-07T18:00:00.000-06:00": the form `createGame` and `updateGame`
 * take a kickoff in, and an exact instant for any other date an admin
 * enters. Built from the league's clock, not the browser's, so an admin
 * anywhere means the same instant.
 */
export const leagueTimeIso = (day: string, time: string): string => {
	const [year, month, date] = day.split('-').map(Number)
	const kickoff = leagueInstant(new Date(Date.UTC(year, month - 1, date)), time)
	const [hours, minutes] = time.split(':').map(Number)
	const offsetMinutes = Math.round(
		(Date.UTC(year, month - 1, date, hours, minutes) - kickoff.getTime()) /
			60_000
	)
	const sign = offsetMinutes < 0 ? '-' : '+'
	const absolute = Math.abs(offsetMinutes)
	const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
	return `${day}T${time}:00.000${offset}`
}
