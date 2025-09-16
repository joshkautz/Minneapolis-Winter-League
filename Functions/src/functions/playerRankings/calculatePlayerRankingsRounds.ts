/**
 * Round-based Player Rankings calculation Firebase Function
 * 
 * This function processes all games grouped by rounds in chronological order.
 * It processes complete rounds rather than individual games, which provides
 * better chronological accuracy when multiple games occur simultaneously.
 * Inactivity decay is always applied as part of the algorithm.
 * 
 * Use this function when:
 * - You want to process games by complete rounds for better accuracy
 * - You need to recalculate everything using round-based processing
 * - You want to compare round-based vs individual game processing results
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

// Validation schema for round-based calculation
const roundsCalculationSchema = z.object({
	// No parameters needed - decay is always applied
})

type RoundsCalculationRequest = z.infer<typeof roundsCalculationSchema>

/**
 * Round-based Player Rankings calculation
 * Processes all games grouped by rounds in chronological order
 */
export const calculatePlayerRankingsRounds = onCall(
	{
		region: 'us-central1',
		timeoutSeconds: 540, // 9 minutes
		memory: '1GiB',
	},
	async (request: CallableRequest<RoundsCalculationRequest>) => {
		try {
			// Validate authentication and admin privileges
			const firestore = getFirestore()
			await validateAdminUser(request.auth, firestore)

			// Validate request data
			roundsCalculationSchema.parse(request.data)

			logger.info('Starting round-based Player Rankings calculation', {
				triggeredBy: request.auth!.uid,
				applyDecay: true, // Always applied
			})

			// Create calculation state document for tracking
			const calculationId = await createCalculationState(
				'round-based',
				request.auth!.uid,
				{ applyDecay: true }
			)

			try {
				await processRoundsCalculation(calculationId)

				return {
					calculationId,
					status: 'completed',
					message: 'Round-based Player Rankings calculation completed successfully.',
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error'
				const errorStack = error instanceof Error ? error.stack : undefined

				logger.error('Round-based calculation failed:', error)
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
					message: `Round-based calculation failed: ${errorMessage}`,
				}
			}
		} catch (error) {
			logger.error('Error starting round-based Player Rankings calculation:', error)
			throw error
		}
	}
)

/**
 * Process the round-based calculation - all games grouped by rounds
 * Decay is always applied as part of the algorithm
 */
async function processRoundsCalculation(
	calculationId: string
): Promise<void> {
	const firestore = getFirestore()

	try {
		await updateCalculationState(calculationId, {
			status: 'running',
			'progress.currentStep': 'Loading all seasons and games...',
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

		logger.info(`Found ${seasons.length} seasons for round-based processing`)

		await updateCalculationState(calculationId, {
			'progress.totalSeasons': seasons.length,
		})

		// Load ALL games from ALL seasons (startSeasonIndex = 0)
		const allGames = await loadGamesForCalculation(seasons, 0)
		logger.info(`Loaded ${allGames.length} total games for round-based processing`)

		await updateCalculationState(calculationId, {
			'progress.currentStep': 'Processing games by rounds...',
			'progress.totalGames': allGames.length,
		})

		// Start with empty player ratings (fresh calculation)
		const playerRatings = new Map()
		logger.info('Starting with empty player ratings (round-based recalculation)')

		// Apply inactivity decay (always applied as part of algorithm)
		await updateCalculationState(calculationId, {
			'progress.currentStep': 'Applying inactivity decay...',
		})

		const currentSeasonId = seasons[seasons.length - 1]?.id
		const allSeasonIds = seasons.map((s) => s.id)
		applyInactivityDecay(playerRatings, currentSeasonId, allSeasonIds)

		// Process ALL games by rounds in chronological order
		await processGamesByRounds(
			allGames,
			playerRatings,
			calculationId,
			seasons.length,
			undefined, // No incremental start season
			undefined  // No incremental start week
		)

		logger.info(`After processing all rounds: ${playerRatings.size} players with ratings`)

		// Save final rankings
		await updateCalculationState(calculationId, {
			'progress.currentStep': 'Saving final rankings...',
			'progress.percentComplete': 95,
		})

		await saveFinalRankings(playerRatings)
		logger.info('Round-based calculation: Final rankings saved successfully')

		// Mark calculation as complete
		await updateCalculationState(calculationId, {
			status: 'completed',
			completedAt: Timestamp.now(),
			'progress.currentStep': 'Complete',
			'progress.percentComplete': 100,
		})

		logger.info(`Round-based Player Rankings calculation completed: ${calculationId}`)
	} catch (error) {
		logger.error(`Round-based Player Rankings calculation failed: ${calculationId}`, error)
		throw error
	}
}