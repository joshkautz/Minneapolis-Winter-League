/**
 * Telling a team how its registration ended: every player on the roster
 * hears when it takes a spot, and when the season fills or closes without
 * it. Each email has a stable id per season, team and player, so a retried
 * trigger or a later sweep sends nobody a second one.
 */

import type { Firestore } from 'firebase-admin/firestore'
import {
	Collections,
	type SeasonDocument,
	type TeamSeasonDocument,
	ROSTER_SUBCOLLECTION,
} from '../types.js'
import { teamSeasonRef } from '../shared/database.js'
import { describeGameNights, gameNightsOf } from './announcement.js'
import { queueEmailOnce } from './outbox.js'

interface TeamContext {
	teamName: string
	season: SeasonDocument | undefined
	rosterIds: string[]
}

async function teamContext(
	firestore: Firestore,
	teamId: string,
	seasonId: string
): Promise<TeamContext | null> {
	const teamSeasonDoc = teamSeasonRef(firestore, teamId, seasonId)
	const [teamSeason, season, roster] = await Promise.all([
		teamSeasonDoc.get(),
		firestore.collection(Collections.SEASONS).doc(seasonId).get(),
		teamSeasonDoc.collection(ROSTER_SUBCOLLECTION).get(),
	])
	if (!teamSeason.exists) return null
	return {
		teamName: (teamSeason.data() as TeamSeasonDocument).name,
		season: season.data() as SeasonDocument | undefined,
		rosterIds: roster.docs.map((doc) => doc.id),
	}
}

/** "November 7, 14 and 21, …", or null for a season without its dates. */
function gameNightsFor(season: SeasonDocument | undefined): string | null {
	if (!season?.dateStart || !season.dateEnd) return null
	const { nights } = gameNightsOf(
		season.dateStart.toDate(),
		season.dateEnd.toDate()
	)
	return nights.length > 0 ? describeGameNights(nights) : null
}

/** Tells every player on a team that it has registered. */
export async function queueTeamRegisteredEmails(
	firestore: Firestore,
	{ teamId, seasonId }: { teamId: string; seasonId: string }
): Promise<number> {
	const context = await teamContext(firestore, teamId, seasonId)
	if (!context) return 0
	const outcomes = await Promise.all(
		context.rosterIds.map((playerId) =>
			queueEmailOnce(firestore, {
				id: `team-registered-${seasonId}-${teamId}-${playerId}`,
				to: { playerId },
				template: 'teamRegistered',
				props: {
					teamName: context.teamName,
					seasonName: context.season?.name ?? 'upcoming',
					gameNights: gameNightsFor(context.season),
				},
			})
		)
	)
	return outcomes.filter((outcome) => outcome === 'queued').length
}

/**
 * Tells every player on a team that it will not play this season. Called
 * before a team that missed out is deleted, while its roster is still there.
 */
export async function queueTeamMissedOutEmails(
	firestore: Firestore,
	params: {
		teamId: string
		seasonId: string
		reason: 'season-full' | 'registration-closed'
		refunding: boolean
	}
): Promise<number> {
	const { teamId, seasonId, reason, refunding } = params
	const context = await teamContext(firestore, teamId, seasonId)
	if (!context) return 0
	const outcomes = await Promise.all(
		context.rosterIds.map((playerId) =>
			queueEmailOnce(firestore, {
				id: `team-missed-out-${seasonId}-${teamId}-${playerId}`,
				to: { playerId },
				template: 'teamMissedOut',
				props: {
					teamName: context.teamName,
					seasonName: context.season?.name ?? 'upcoming',
					reason,
					refunding,
				},
			})
		)
	)
	return outcomes.filter((outcome) => outcome === 'queued').length
}
