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

const dollars = (cents: number): string =>
	`$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export function seasonAnnouncementProps(
	season: SeasonDocument
): SeasonAnnouncementProps {
	if (typeof season.teamRegistrationTotalCents !== 'number') {
		throw new Error(
			'The announcement describes team pricing, and this season has none.'
		)
	}
	return {
		seasonName: season.name,
		registrationOpens: leagueDay(season.registrationStart.toDate()),
		registrationCloses: leagueDay(season.registrationEnd.toDate()),
		firstGame: leagueDay(season.dateStart.toDate()),
		teamFee: dollars(season.teamRegistrationTotalCents),
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
