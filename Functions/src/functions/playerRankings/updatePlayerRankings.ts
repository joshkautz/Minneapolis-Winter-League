/**
 * Player Rankings Incremental Update Firebase Function
 *
 * This function efficiently updates player rankings by processing only the rounds
 * that haven't been calculated yet. It's designed for production use where you
 * regularly add new games and want to update rankings without recalculating everything.
 *
 * The function automatically identifies which rounds are new since the last calculation
 * and processes only those rounds, making it much faster than a full rebuild.
 *
 * Use this function when:
 * - Adding new games to an existing league with established rankings
 * - Running regular ranking updates in production
 * - You want the fastest calculation for incremental updates
 * - You need to process only the latest data efficiently
 *
 * For initial setup or complete recalculation, use rebuildPlayerRankings instead.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { CallableRequest, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { z } from 'zod'
import { Collections, SeasonDocument } from '../../types.js'
import { validateAdminUser } from '../../shared/auth.js'
import {
	loadGamesForCalculation,
	processNewRoundsOnly,
	saveFinalRankings,
	createCalculationState,
	updateCalculationState,
	loadExistingRankings,
	hasExistingRankings,
} from '../../services/playerRankings/index.js'

// Validation schema for incremental update calculation
const updateRankingsSchema = z.object({
	// No parameters needed - function auto-detects new rounds
})

type UpdateRankingsRequest = z.infer<typeof updateRankingsSchema>

/**
 * Player Rankings Incremental Update
 * Efficiently updates rankings by processing only new uncalculated rounds
 */
export const updatePlayerRankings = onCall(
	{
		region: 'us-central1',
		timeoutSeconds: 540, // 9 minutes
		memory: '1GiB',
	},
	async (request: CallableRequest<UpdateRankingsRequest>) => {
		try {
			// Validate authentication and admin privileges
			const firestore = getFirestore()
			await validateAdminUser(request.auth, firestore)

			// Validate request data
			updateRankingsSchema.parse(request.data)

			logger.info('Starting incremental Player Rankings update', {
				triggeredBy: request.auth!.uid,
				applyDecay: true, // Always applied
			})

			// Create calculation state document for tracking
			const calculationId = await createCalculationState(
				'round-based',
				request.auth!.uid,
				{ applyDecay: true, onlyNewRounds: true, isIncremental: true }
			)

			try {
				await processIncrementalUpdate(calculationId)

				return {
					calculationId,
					status: 'completed',
					message: 'Player Rankings incremental update completed successfully.',
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : 'Unknown error'
				const errorStack = error instanceof Error ? error.stack : undefined

				logger.error('Player Rankings incremental update failed:', error)
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
					message: `Player Rankings incremental update failed: ${errorMessage}`,
				}
			}
		} catch (error) {
			logger.error('Error starting Player Rankings incremental update:', error)
			throw error
		}
	}
)

/**
 * Process only the new uncalculated rounds for efficient incremental updates
 * Loads existing rankings and processes only new data
 */
async function processIncrementalUpdate(calculationId: string): Promise<void> {
	const firestore = getFirestore()

	try {
		await updateCalculationState(calculationId, {
			status: 'running',
			'progress.currentStep':
				'Identifying new rounds for incremental update...',
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

		logger.info(`Found ${seasons.length} seasons for incremental update`)

		await updateCalculationState(calculationId, {
			'progress.totalSeasons': seasons.length,
		})

		// Load ALL games to identify which rounds are new
		const allGames = await loadGamesForCalculation(seasons, 0)
		logger.info(`Loaded ${allGames.length} total games to identify new rounds`)

		await updateCalculationState(calculationId, {
			'progress.currentStep':
				'Processing only new rounds for efficient update...',
		})

		// Start with empty player ratings - processNewRoundsOnly will handle loading existing ratings
		// when there are existing calculated rounds, or process all rounds if this is the first calculation
		const playerRatings = new Map()
		logger.info(
			'Starting incremental update (will load existing ratings or start fresh if none exist)'
		)

		// Load existing rankings for incremental update to preserve totalGames and other stats
		const hasExisting = await hasExistingRankings()
		if (hasExisting) {
			logger.info('Loading existing player rankings for incremental update...')
			const existingRankings = await loadExistingRankings()

			// Copy existing rankings into our working map
			for (const [playerId, playerState] of existingRankings) {
				playerRatings.set(playerId, playerState)
			}

			logger.info(
				`Loaded ${playerRatings.size} existing player rankings with preserved totalGames counts`
			)
		} else {
			logger.info('No existing rankings found - starting fresh calculation')
		}

		// Process ONLY new uncalculated rounds (most efficient for production)
		// Round-based decay is now applied automatically during round processing
		await processNewRoundsOnly(
			allGames,
			playerRatings,
			calculationId,
			seasons.length,
			undefined // Auto-detect incremental start season
		)

		logger.info(
			`After incremental update: ${playerRatings.size} players with ratings`
		)

		// Save final rankings
		await updateCalculationState(calculationId, {
			'progress.currentStep': 'Saving updated rankings...',
			'progress.percentComplete': 95,
		})

		await saveFinalRankings(playerRatings)
		logger.info('Incremental update: Final rankings saved successfully')

		// Mark calculation as complete
		await updateCalculationState(calculationId, {
			status: 'completed',
			completedAt: Timestamp.now(),
			'progress.currentStep': 'Complete',
			'progress.percentComplete': 100,
		})

		logger.info(
			`Player Rankings incremental update completed: ${calculationId}`
		)
	} catch (error) {
		logger.error(
			`Player Rankings incremental update failed: ${calculationId}`,
			error
		)
		throw error
	}
}
