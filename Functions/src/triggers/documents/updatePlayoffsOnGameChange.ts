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
 * Retried on failure: the update is idempotent, a transaction that writes
 * only what differs from the plan, so a retry after a partial success does
 * nothing twice. A season that cannot be scheduled — not twelve teams, an
 * unsupported number of nights — is logged and not retried: a retry would
 * fail the same way for a day. A slot an admin's game holds, or a night
 * whose pairing a corrected score would change after it began, is logged
 * as a warning for an admin. Its own writes fire it again, and that run
 * finds nothing left to do.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'
import { syncPlayoffsIfSchedulable } from '../../services/schedule/sync.js'
import type { GameDocument, SeasonDocument } from '../../types.js'

/**
 * What the schedule reads from a game, as a comparable string. A write that
 * leaves it the same (a name refresh, a forfeit flag) cannot change the
 * playoffs, and is skipped.
 */
const scheduleView = (game: GameDocument | undefined): string =>
	game
		? JSON.stringify([
				game.season?.id,
				game.type,
				game.playoffSlot ?? null,
				game.date?.toMillis(),
				game.field,
				game.home?.id ?? null,
				game.away?.id ?? null,
				game.homeScore ?? null,
				game.awayScore ?? null,
			])
		: ''

/** Syncs one season's playoffs, logging what changed or needs an admin. */
async function syncSeasonPlayoffs(
	firestore: Firestore,
	seasonId: string,
	gameId: string
): Promise<void> {
	const summary = await syncPlayoffsIfSchedulable(firestore, seasonId, {
		gameId,
	})
	if (!summary) return
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

		const before = event.data?.before.data() as GameDocument | undefined
		const after = event.data?.after.data() as GameDocument | undefined
		if (scheduleView(before) === scheduleView(after)) return

		// A game moved to another season changes both.
		const seasonRefs = new Map(
			[before, after]
				.map((data) => data?.season)
				.filter((ref): ref is NonNullable<typeof ref> => Boolean(ref))
				.map((ref) => [ref.id, ref])
		)
		for (const seasonRef of seasonRefs.values()) {
			const season = (await seasonRef.get()).data() as
				SeasonDocument | undefined
			if (!season?.automaticPlayoffs) continue
			await syncSeasonPlayoffs(firestore, seasonRef.id, event.params.gameId)
		}
	}
)
