/**
 * The facts about a season the home page states, worked out from the
 * season rather than typed into the page, so they cannot go stale when the
 * next season is created.
 */

import { leagueNights, leagueSaturdays } from '@/shared/league-calendar'
import { ordinal } from '@/shared/utils'

/** "November" and "7th" for a calendar day held as UTC midnight. */
const monthOf = (day: Date): string =>
	day.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })

/** "A, B and C". */
const listOf = (items: string[]): string =>
	items.length <= 1
		? (items[0] ?? '')
		: `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/**
 * "November 7th, 14th, 21st and December 5th, 12th, 19th": the days, each
 * month named once.
 */
export const daysInWords = (days: readonly Date[]): string => {
	const months: { month: string; days: string[] }[] = []
	for (const day of days) {
		const month = monthOf(day)
		const date = ordinal(day.getUTCDate())
		const last = months[months.length - 1]
		if (last?.month === month) last.days.push(date)
		else months.push({ month, days: [date] })
	}
	return listOf(months.map(({ month, days }) => `${month} ${days.join(', ')}`))
}

export interface SeasonFacts {
	/** The nights games are played. */
	nights: Date[]
	/** Saturdays inside the season with no games: the Thanksgiving break. */
	breaks: Date[]
}

export const seasonFacts = (dateStart: Date, dateEnd: Date): SeasonFacts => {
	const nights = leagueNights(dateStart, dateEnd)
	const played = new Set(nights.map((night) => night.getTime()))
	return {
		nights,
		breaks: leagueSaturdays(dateStart, dateEnd).filter(
			(saturday) => !played.has(saturday.getTime())
		),
	}
}
