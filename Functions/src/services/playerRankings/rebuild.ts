/**
 * The rankings rebuild: read every game, run the engine, save the result.
 * Shared by the admin's Rebuild button and the nightly schedule.
 *
 * The output depends only on the games and rosters, so a rebuild with
 * nothing new to count writes what was already there.
 */

import {
	FieldValue,
	getFirestore,
	type Timestamp,
} from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, type RankingsCalculationDocument } from '../../types.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { runRankings } from './engine/rankingEngine.js'
import { projectRankings } from './engine/projections.js'
import { loadRankingInput } from './persistence/inputLoader.js'
import { saveRankings } from './persistence/rankingsSaver.js'
import {
	createCalculationState,
	updateCalculationState,
} from './persistence/calculationState.js'

export interface RebuildResult {
	calculationId: string
	status: 'completed' | 'failed'
	message: string
}

/**
 * A rebuild that has been running longer than this has died — timed out or
 * crashed — without marking itself failed, and no longer blocks another.
 */
const STALE_RUNNING_MS = 15 * 60 * 1000

/** Whether another rebuild is running now. */
export async function isRebuildRunning(now = new Date()): Promise<boolean> {
	const recent = await getFirestore()
		.collection(Collections.RANKINGS_CALCULATIONS)
		.orderBy('startedAt', 'desc')
		.limit(5)
		.get()
	return recent.docs.some((doc) => {
		const calculation = doc.data() as RankingsCalculationDocument
		const startedAt = (calculation.startedAt as Timestamp | null)?.toMillis()
		return (
			(calculation.status === 'running' || calculation.status === 'pending') &&
			startedAt !== undefined &&
			now.getTime() - startedAt < STALE_RUNNING_MS
		)
	})
}

/**
 * Rebuilds every ranking from every completed game. Never throws: a failure
 * is recorded on the calculation document and returned.
 *
 * @param triggeredBy the admin's uid, or 'schedule'
 */
export async function rebuildRankings(
	triggeredBy: string
): Promise<RebuildResult> {
	const firestore = getFirestore()
	const calculationId = await createCalculationState(triggeredBy)

	try {
		await updateCalculationState(calculationId, {
			status: 'running',
			'progress.currentStep': 'Loading games and rosters...',
			'progress.percentComplete': 10,
		})
		const loaded = await loadRankingInput(firestore)
		const completedGames = loaded.input.games.filter(
			(game) => game.homeScore !== null && game.awayScore !== null
		).length

		await updateCalculationState(calculationId, {
			'progress.currentStep': 'Calculating ratings...',
			'progress.percentComplete': 40,
			'progress.totalSeasons': loaded.seasonIds.length,
			'progress.totalGames': completedGames,
		})
		const result = runRankings(loaded.input)
		const projections = projectRankings(
			result,
			loaded.seasonRosters,
			FIREBASE_CONFIG.TIME_ZONE
		)

		await updateCalculationState(calculationId, {
			'progress.currentStep': 'Saving rankings...',
			'progress.percentComplete': 70,
		})
		await saveRankings(firestore, {
			projections,
			rounds: result.rounds,
			playerNames: loaded.input.playerNames,
			seasonIds: loaded.seasonIds,
			calculationId,
		})

		await updateCalculationState(calculationId, {
			status: 'completed',
			completedAt: FieldValue.serverTimestamp(),
			'progress.currentStep': 'Complete',
			'progress.percentComplete': 100,
		})
		logger.info('Rankings rebuild completed', {
			calculationId,
			triggeredBy,
			players: projections.final.length,
			rounds: result.rounds.length,
		})
		return {
			calculationId,
			status: 'completed',
			message: 'Player Rankings full rebuild completed successfully.',
		}
	} catch (error) {
		logger.error('Rankings rebuild failed', { calculationId, error })
		try {
			// The message only: calculation documents are public, so a stack
			// trace would publish the server's internals.
			await updateCalculationState(calculationId, {
				status: 'failed',
				error: {
					message: error instanceof Error ? error.message : String(error),
					timestamp: FieldValue.serverTimestamp(),
				},
			})
		} catch (recordError) {
			logger.error('Could not record the rebuild failure', {
				calculationId,
				error: recordError,
			})
		}
		return {
			calculationId,
			status: 'failed',
			message:
				'The rankings could not be rebuilt. The error is in the server logs; please try again.',
		}
	}
}
