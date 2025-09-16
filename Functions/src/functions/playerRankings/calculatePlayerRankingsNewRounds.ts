/**
 * New Rounds Only Player Rankings calculation Firebase Function
 * 
 * This function processes only uncalculated rounds that have been added since
 * the last calculation. It's the most efficient option for production use.
 * Inactivity decay is always applied as part of the algorithm.
 * 
 * Use this function when:
 * - You've added new game rounds and want to update rankings incrementally
 * - You want the fastest calculation for regular production updates
 * - You need to process only the latest data without recalculating everything
 * 
 * This is the RECOMMENDED function for production workflows.
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
	processNewRoundsOnly,
	saveFinalRankings,
	createCalculationState,
	updateCalculationState,
} from '../../services/playerRankings/index.js'

// Validation schema for new rounds calculation
const newRoundsCalculationSchema = z.object({
	// No parameters needed - decay is always applied as part of algorithm
})

type NewRoundsCalculationRequest = z.infer<typeof newRoundsCalculationSchema>

/**
 * New Rounds Only Player Rankings calculation - PRODUCTION FUNCTION
 * Processes only uncalculated rounds for efficient incremental updates
 */
export const calculatePlayerRankingsNewRounds = onCall(
	{
		region: 'us-central1',
		timeoutSeconds: 540, // 9 minutes
		memory: '1GiB',
	},
	async (request: CallableRequest<NewRoundsCalculationRequest>) => {
		try {
			// Validate authentication and admin privileges
			const firestore = getFirestore()
			await validateAdminUser(request.auth, firestore)

			// Validate request data
			newRoundsCalculationSchema.parse(request.data)

			logger.info('Starting new rounds only Player Rankings calculation', {
				triggeredBy: request.auth!.uid,
				applyDecay: true, // Always applied
			})

			// Create calculation state document for tracking
			const calculationId = await createCalculationState(
				'round-based',
				request.auth!.uid,
				{ applyDecay: true, onlyNewRounds: true }
			)

			try {
				await processNewRoundsCalculation(calculationId)

				return {
					calculationId,
					status: 'completed',
					message: 'New rounds Player Rankings calculation completed successfully.',
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error'
				const errorStack = error instanceof Error ? error.stack : undefined

				logger.error('New rounds calculation failed:', error)
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
					message: `New rounds calculation failed: ${errorMessage}`,
				}
			}
		} catch (error) {
			logger.error('Error starting new rounds Player Rankings calculation:', error)
			throw error
		}
	}
)

/**
 * Process only the new uncalculated rounds - most efficient for production
 * Decay is always applied as part of the algorithm
 */
async function processNewRoundsCalculation(
	calculationId: string
): Promise<void> {
	const firestore = getFirestore()

	try {
		await updateCalculationState(calculationId, {
			status: 'running',
			'progress.currentStep': 'Loading seasons and checking for new rounds...',
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

		logger.info(`Found ${seasons.length} seasons for new rounds processing`)

		await updateCalculationState(calculationId, {
			'progress.totalSeasons': seasons.length,
		})

		// Load ALL games to identify new rounds
		const allGames = await loadGamesForCalculation(seasons, 0)
		logger.info(`Loaded ${allGames.length} total games to identify new rounds`)

		await updateCalculationState(calculationId, {
			'progress.currentStep': 'Identifying and processing new rounds only...',
		})

		// Start with empty player ratings - processNewRoundsOnly will load existing ratings
		const playerRatings = new Map()
		logger.info('Starting new rounds processing (will load existing ratings)')

		// Apply inactivity decay (always applied as part of algorithm)
		await updateCalculationState(calculationId, {
			'progress.currentStep': 'Applying inactivity decay...',
		})

		const currentSeasonId = seasons[seasons.length - 1]?.id
		const allSeasonIds = seasons.map((s) => s.id)
		applyInactivityDecay(playerRatings, currentSeasonId, allSeasonIds)

		// Process ONLY new uncalculated rounds
		await processNewRoundsOnly(
			allGames,
			playerRatings,
			calculationId,
			seasons.length,
			undefined, // No incremental start season (will auto-detect)
			undefined  // No incremental start week (will auto-detect)
		)

		logger.info(`After processing new rounds: ${playerRatings.size} players with ratings`)

		// Save final rankings
		await updateCalculationState(calculationId, {
			'progress.currentStep': 'Saving final rankings...',
			'progress.percentComplete': 95,
		})

		await saveFinalRankings(playerRatings)
		logger.info('New rounds calculation: Final rankings saved successfully')

		// Mark calculation as complete
		await updateCalculationState(calculationId, {
			status: 'completed',
			completedAt: Timestamp.now(),
			'progress.currentStep': 'Complete',
			'progress.percentComplete': 100,
		})

		logger.info(`New rounds Player Rankings calculation completed: ${calculationId}`)
	} catch (error) {
		logger.error(`New rounds Player Rankings calculation failed: ${calculationId}`, error)
		throw error
	}
}