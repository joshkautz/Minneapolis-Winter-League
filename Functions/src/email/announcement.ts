/** Who the new-season announcement goes to, and what it says. */

import type { Firestore } from 'firebase-admin/firestore'
import { FIREBASE_CONFIG } from '../config/constants.js'
import { playerContactRef, playerRef } from '../shared/database.js'
import {
	DAY_MS,
	isSaturday,
	leagueCalendarDay,
	thanksgivingSaturday,
} from '../shared/leagueCalendar.js'
import {
	ROSTER_SUBCOLLECTION,
	type PlayerContactDocument,
	type PlayerDocument,
	type SeasonDocument,
	type TeamRosterDocument,
} from '../types.js'
import type { SeasonAnnouncementProps } from './templates/SeasonAnnouncement.js'
import {
	MIN_SIGNED_PLAYERS,
	REGISTRATION_SPOTS,
} from '../shared/teamPaymentRules.js'

/** "Thursday, October 1", on Minneapolis's calendar. */
const leagueDay = (date: Date): string =>
	new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		timeZone: FIREBASE_CONFIG.TIME_ZONE,
	}).format(date)

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
		if (!isSaturday(day)) continue
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

/**
 * The season is not ready to announce. Its message is written for the admin
 * sending the announcement, so the callable passes it on as written.
 */
export class AnnouncementNotReadyError extends Error {
	override name = 'AnnouncementNotReadyError'
}

export function seasonAnnouncementProps(
	season: SeasonDocument
): SeasonAnnouncementProps {
	// It tells players teams pay together; the amount is left to the site.
	if (typeof season.teamRegistrationTotalCents !== 'number') {
		throw new AnnouncementNotReadyError(
			'The announcement describes team pricing, and this season has none.'
		)
	}
	const { nights, skipsThanksgiving } = gameNightsOf(
		season.dateStart.toDate(),
		season.dateEnd.toDate()
	)
	if (nights.length === 0) {
		throw new AnnouncementNotReadyError(
			'The season has no Saturday between its first and last day.'
		)
	}
	return {
		seasonName: season.name,
		registrationOpens: leagueDay(season.registrationStart.toDate()),
		registrationCloses: leagueDay(season.registrationEnd.toDate()),
		gameNights: describeGameNights(nights),
		skipsThanksgiving,
		teamSpots: REGISTRATION_SPOTS,
		minimumSignedPlayers: MIN_SIGNED_PLAYERS,
	}
}

/**
 * Everyone who has ever been on a roster, in any season, who has an email
 * address and is not banned.
 */
export async function announcementRecipients(
	firestore: Firestore
): Promise<string[]> {
	const rosters = await firestore.collectionGroup(ROSTER_SUBCOLLECTION).get()
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
