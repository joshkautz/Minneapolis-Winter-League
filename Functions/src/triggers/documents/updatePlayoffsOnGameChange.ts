/**
 * Automatic playoffs trigger
 *
 * Fires on every write to a game. When the game belongs to a season whose
 * schedule was generated, brings that season's playoffs up to date: the
 * last regular-season score creates pool night, the last pool score
 * championship night's first games, each field's first two results its
 * last two, and the final results the placements
 * (`services/schedule/sync.ts`).
 *
 * Retried on failure: the update is idempotent, a transaction that only
 * ever creates what is missing, so a retry after a partial success does
 * nothing twice. A season that cannot be scheduled — not twelve teams, an
 * unsupported number of nights — is logged and not retried: a retry would
 * fail the same way for a day. A slot an admin's game holds, or a night
 * whose pairing a corrected score would change after it began, is logged
 * as a warning for an admin. Its own writes fire it again, and that run
 * finds nothing left to do.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'
import { updatePlayoffs } from '../../services/schedule/sync.js'
import type { GameDocument, SeasonDocument } from '../../types.js'

/** Updates one season's playoffs, logging what changed or needs an admin. */
async function updateSeason(
	firestore: Firestore,
	seasonId: string,
	gameId: string
): Promise<void> {
	try {
		const summary = await updatePlayoffs(firestore, seasonId)
		if (summary.conflicts.length > 0 || summary.kept.length > 0) {
			logger.warn('Playoffs need an admin', { gameId, ...summary })
		} else if (
			summary.created > 0 ||
			summary.updated > 0 ||
			summary.placementsSet > 0 ||
			summary.ranksSet > 0
		) {
			logger.info('Playoffs updated', { gameId, ...summary })
		}
	} catch (error) {
		if (error instanceof HttpsError && error.code === 'failed-precondition') {
			logger.warn('Playoffs not updated: the season cannot be scheduled', {
				gameId,
				seasonId,
				reason: error.message,
			})
			return
		}
		throw error
	}
}

export const updatePlayoffsOnGameChange = onDocumentWritten(
	{
		document: 'games/{gameId}',
		region: FIREBASE_CONFIG.REGION,
		// A throw is only retried with this set; see .claude/rules/functions.md.
		retry: true,
	},
	async (event) => {
		const firestore = getFirestore()
		if (await isMigrationInProgress(firestore)) {
			logger.info(
				'Skipping updatePlayoffsOnGameChange — migration in progress',
				{
					eventId: event.id,
					gameId: event.params.gameId,
				}
			)
			return
		}

		// A game moved to another season changes both.
		const seasonRefs = new Map(
			[event.data?.before.data(), event.data?.after.data()]
				.map((data) => (data as GameDocument | undefined)?.season)
				.filter((ref): ref is NonNullable<typeof ref> => Boolean(ref))
				.map((ref) => [ref.id, ref])
		)
		for (const seasonRef of seasonRefs.values()) {
			const season = (await seasonRef.get()).data() as
				SeasonDocument | undefined
			if (!season?.automaticPlayoffs) continue
			await updateSeason(firestore, seasonRef.id, event.params.gameId)
		}
	}
)
