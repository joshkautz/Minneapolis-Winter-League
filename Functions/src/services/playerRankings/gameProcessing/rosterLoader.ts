import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	DocumentReference,
	PlayerDocument,
	TeamDocument,
	TeamRosterDocument,
} from '../../../types.js'
import { teamSeasonRef } from '../../../shared/database.js'

/**
 * Reads the player refs on a team's roster for a given season.
 *
 * Rosters live at `teams/{teamId}/teamSeasons/{seasonId}/roster/{playerId}`.
 * Before the 2026 data model migration they were an array field on the team
 * document, and the rankings pipeline still read that array — which no longer
 * exists, so every game was skipped as having an empty roster and a rebuild
 * produced no rankings at all. Read the subcollection instead.
 *
 * Returns an empty array when the team, its season subdoc or its roster is
 * missing; the caller decides whether that is worth skipping the game over.
 */
export async function loadRosterPlayerRefs(
	teamRef: DocumentReference<TeamDocument>,
	seasonId: string
): Promise<DocumentReference<PlayerDocument>[]> {
	const firestore = getFirestore()

	const rosterSnapshot = await teamSeasonRef(firestore, teamRef.id, seasonId)
		.collection('roster')
		.get()

	return rosterSnapshot.docs.flatMap((doc) => {
		const entry = doc.data() as TeamRosterDocument | undefined
		if (!entry?.player) {
			logger.warn(
				`Roster entry teams/${teamRef.id}/teamSeasons/${seasonId}/roster/${doc.id} has no player ref`
			)
			return []
		}
		return [entry.player]
	})
}
