/**
 * Player Rankings Full Rebuild Firebase Function
 *
 * This function performs a complete rebuild of all player rankings from scratch.
 * It processes all games grouped by rounds in chronological order, starting with
 * empty player ratings. This provides the most accurate and comprehensive ranking
 * calculation.
 *
 * Use this function when:
 * - Setting up rankings for the first time
 * - You need to completely recalculate all rankings from scratch
 * - Recovering from data corruption or algorithm changes
 * - Running periodic full audits of the ranking system
 *
 * For regular updates after adding new games, use updatePlayerRankings instead.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { CallableRequest, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { z } from 'zod'
import { Collections, SeasonDocument } from '../../types.js'
import { validateAdminUser } from '../../shared/auth.js'
import {
	applyInactivityDecay,
	loadGamesForCalculation,
	processGamesByRounds,
	saveFinalRankings,
	createCalculationState,
	updateCalculationState,
} from '../../services/playerRankings/index.js'

// Validation schema for full rebuild calculation
const rebuildRankingsSchema = z.object({
	// No parameters needed - decay is always applied
})

type RebuildRankingsRequest = z.infer<typeof rebuildRankingsSchema>

/**
 * Player Rankings Full Rebuild
 * Completely rebuilds all player rankings from scratch by processing all games chronologically
 */
export const rebuildPlayerRankings = onCall(
	{
		region: 'us-central1',
		timeoutSeconds: 540, // 9 minutes
		memory: '1GiB',
	},
	async (request: CallableRequest<RebuildRankingsRequest>) => {
		try {
			// Validate authentication and admin privileges
			const firestore = getFirestore()
			await validateAdminUser(request.auth, firestore)

			// Validate request data
			rebuildRankingsSchema.parse(request.data)

			logger.info('Starting complete Player Rankings rebuild', {
				triggeredBy: request.auth!.uid,
				applyDecay: true, // Always applied
			})

			// Create calculation state document for tracking
			const calculationId = await createCalculationState(
				'round-based',
				request.auth!.uid,
				{ applyDecay: true, isFullRebuild: true }
			)

			try {
				await processFullRebuild(calculationId)

				return {
					calculationId,
					status: 'completed',
					message: 'Player Rankings full rebuild completed successfully.',
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : 'Unknown error'
				const errorStack = error instanceof Error ? error.stack : undefined

				logger.error('Player Rankings rebuild failed:', error)
				await updateCalculationState(calculationId, {
					status: 'failed',
					error: {
						message: errorMessage,
						stack: errorStack,
						timestamp: Timestamp.now(),
					},
				})

				return {
					calculationId,
					status: 'failed',
					message: `Player Rankings rebuild failed: ${errorMessage}`,
				}
			}
		} catch (error) {
			logger.error('Error starting Player Rankings rebuild:', error)
			throw error
		}
	}
)

/**
 * Process the complete rebuild - all games from scratch
 * Starts with empty player ratings and processes all games chronologically
 */
async function processFullRebuild(calculationId: string): Promise<void> {
	const firestore = getFirestore()

	try {
		await updateCalculationState(calculationId, {
			status: 'running',
			'progress.currentStep':
				'Loading all seasons and games for complete rebuild...',
		})

		// Get all seasons ordered by start date
		const seasonsSnapshot = await firestore
			.collection(Collections.SEASONS)
			.orderBy('dateStart', 'asc')
			.get()

		const seasons = seasonsSnapshot.docs.map((doc) => ({
			id: doc.id,
			...doc.data(),
		})) as (SeasonDocument & { id: string })[]

		logger.info(`Found ${seasons.length} seasons for complete rebuild`)

		await updateCalculationState(calculationId, {
			'progress.totalSeasons': seasons.length,
		})

		// Load ALL games from ALL seasons (startSeasonIndex = 0)
		const allGames = await loadGamesForCalculation(seasons, 0)
		logger.info(`Loaded ${allGames.length} total games for complete rebuild`)

		await updateCalculationState(calculationId, {
			'progress.currentStep': 'Rebuilding rankings from scratch...',
			'progress.totalGames': allGames.length,
		})

		// Start with completely empty player ratings (complete rebuild)
		const playerRatings = new Map()
		logger.info('Starting complete rebuild with empty player ratings')

		// Apply inactivity decay (always applied as part of algorithm)
		await updateCalculationState(calculationId, {
			'progress.currentStep': 'Applying inactivity decay...',
		})

		const currentSeasonId = seasons[seasons.length - 1]?.id
		const allSeasonIds = seasons.map((s) => s.id)
		applyInactivityDecay(playerRatings, currentSeasonId, allSeasonIds)

		// Process ALL games by rounds in chronological order (no filtering)
		await processGamesByRounds(
			allGames,
			playerRatings,
			calculationId,
			seasons.length,
			undefined, // No incremental start season
			false, // Process all rounds, not just new ones
			true // This is a full rebuild
		)

		logger.info(
			`After complete rebuild: ${playerRatings.size} players with ratings`
		)

		// Save final rankings
		await updateCalculationState(calculationId, {
			'progress.currentStep': 'Saving rebuilt rankings...',
			'progress.percentComplete': 95,
		})

		await saveFinalRankings(playerRatings)
		logger.info('Complete rebuild: Final rankings saved successfully')

		// Mark calculation as complete
		await updateCalculationState(calculationId, {
			status: 'completed',
			completedAt: Timestamp.now(),
			'progress.currentStep': 'Complete',
			'progress.percentComplete': 100,
		})

		logger.info(`Player Rankings complete rebuild finished: ${calculationId}`)
	} catch (error) {
		logger.error(`Player Rankings rebuild failed: ${calculationId}`, error)
		throw error
	}
}
