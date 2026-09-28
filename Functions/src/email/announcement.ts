/** Who the new-season announcement goes to, and what it says. */

import type { Firestore } from 'firebase-admin/firestore'
import { FIREBASE_CONFIG, TEAM_CONFIG } from '../config/constants.js'
import { playerContactRef, playerRef } from '../shared/database.js'
import type {
	PlayerContactDocument,
	PlayerDocument,
	SeasonDocument,
	TeamRosterDocument,
} from '../types.js'
import type { SeasonAnnouncementProps } from './templates/SeasonAnnouncement.js'

/** "Thursday, October 1", on Minneapolis's calendar. */
export const leagueDay = (date: Date): string =>
	new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		timeZone: FIREBASE_CONFIG.TIME_ZONE,
	}).format(date)

/** The calendar day an instant falls on in Minneapolis, as UTC midnight. */
const leagueCalendarDay = (instant: Date): Date => {
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

const DAY_MS = 24 * 60 * 60 * 1000
const SATURDAY = 6
const THURSDAY = 4
const NOVEMBER = 10

/** The Saturday after Thanksgiving (the fourth Thursday of November). */
export const thanksgivingSaturday = (year: number): Date => {
	const firstWeekday = new Date(Date.UTC(year, NOVEMBER, 1)).getUTCDay()
	const firstThursday = 1 + ((THURSDAY - firstWeekday + 7) % 7)
	return new Date(Date.UTC(year, NOVEMBER, firstThursday + 21 + 2))
}

/**
 * The season's game nights: every Saturday from its first day to its last,
 * except the Saturday after Thanksgiving, which the league takes off. Dates
 * are calendar days in Minneapolis, as UTC midnight.
 */
export function gameNightsOf(
	dateStart: Date,
	dateEnd: Date
): { nights: Date[]; skipsThanksgiving: boolean } {
	const nights: Date[] = []
	let skipsThanksgiving = false
	const last = leagueCalendarDay(dateEnd).getTime()
	for (
		let day = leagueCalendarDay(dateStart);
		day.getTime() <= last;
		day = new Date(day.getTime() + DAY_MS)
	) {
		if (day.getUTCDay() !== SATURDAY) continue
		if (
			day.getTime() === thanksgivingSaturday(day.getUTCFullYear()).getTime()
		) {
			skipsThanksgiving = true
			continue
		}
		nights.push(day)
	}
	return { nights, skipsThanksgiving }
}

/** "a", "a and b", "a, b and c". */
const listOf = (items: string[], separator = ', '): string =>
	items.length <= 1
		? items.join('')
		: `${items.slice(0, -1).join(separator)} and ${items[items.length - 1]}`

/**
 * Game nights grouped by month: "November 7, 14 and 21, and December 5, 12
 * and 19".
 */
export function describeGameNights(nights: Date[]): string {
	const months: { month: string; days: number[] }[] = []
	for (const night of nights) {
		const month = night.toLocaleDateString('en-US', {
			month: 'long',
			timeZone: 'UTC',
		})
		const current = months[months.length - 1]
		if (current?.month === month) current.days.push(night.getUTCDate())
		else months.push({ month, days: [night.getUTCDate()] })
	}
	const groups = months.map(
		({ month, days }) => `${month} ${listOf(days.map(String))}`
	)
	// A comma before the last month's "and", since each month has its own.
	return groups.length <= 1
		? groups.join('')
		: `${groups.slice(0, -1).join(', ')}, and ${groups[groups.length - 1]}`
}

export function seasonAnnouncementProps(
	season: SeasonDocument
): SeasonAnnouncementProps {
	// It tells players teams pay together; the amount is left to the site.
	if (typeof season.teamRegistrationTotalCents !== 'number') {
		throw new Error(
			'The announcement describes team pricing, and this season has none.'
		)
	}
	const { nights, skipsThanksgiving } = gameNightsOf(
		season.dateStart.toDate(),
		season.dateEnd.toDate()
	)
	if (nights.length === 0) {
		throw new Error(
			'The season has no Saturday between its first and last day.'
		)
	}
	return {
		seasonName: season.name,
		registrationOpens: leagueDay(season.registrationStart.toDate()),
		registrationCloses: leagueDay(season.registrationEnd.toDate()),
		gameNights: describeGameNights(nights),
		skipsThanksgiving,
		teamSpots: TEAM_CONFIG.REGISTERED_TEAMS_FOR_LOCK,
		minimumSignedPlayers: TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION,
	}
}

/**
 * Everyone who has ever been on a roster, in any season, who has an email
 * address and is not banned.
 */
export async function announcementRecipients(
	firestore: Firestore
): Promise<string[]> {
	const rosters = await firestore.collectionGroup('roster').get()
	const playerIds = [
		...new Set(
			rosters.docs.flatMap((doc) => {
				const player = (doc.data() as TeamRosterDocument).player
				return player ? [player.id] : []
			})
		),
	].sort()
	if (playerIds.length === 0) return []

	const [players, contacts] = await Promise.all([
		firestore.getAll(...playerIds.map((id) => playerRef(firestore, id))),
		firestore.getAll(...playerIds.map((id) => playerContactRef(firestore, id))),
	])
	return playerIds.filter((_, i) => {
		const player = players[i].data() as PlayerDocument | undefined
		const contact = contacts[i].data() as PlayerContactDocument | undefined
		return player && !player.banned && Boolean(contact?.email)
	})
}
