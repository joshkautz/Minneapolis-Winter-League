/**
 * Hall of Fame calculation Firebase Functions
 *
 * These functions handle the manual triggering and processing of player rankings
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { CallableRequest, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { z } from 'zod'
import { Collections, SeasonDocument } from '../../types.js'
import {
	PlayerRatingState,
	applyInactivityDecay,
	loadGamesForCalculation,
	processGamesChronologically,
	processGamesByRounds,
	processNewRoundsOnly,
	determineIncrementalStartPoint,
	saveFinalRankings,
	createCalculationState,
	updateCalculationState,
} from '../../services/hallOfFame/index.js'

// Validation schemas
const calculateRankingsSchema = z.object({
	calculationType: z.enum(['full', 'incremental', 'round-based']),
	applyDecay: z.boolean().default(true),
	startSeasonId: z.string().optional(),
	startWeek: z.number().optional(),
	onlyNewRounds: z.boolean().default(false), // For round-based calculations
})

type CalculateRankingsRequest = z.infer<typeof calculateRankingsSchema>

/**
 * Manually triggered Hall of Fame calculation function
 */
export const calculateHallOfFameRankings = onCall(
	{
		region: 'us-central1',
		timeoutSeconds: 540, // 9 minutes - this is a long-running process
		memory: '1GiB',
	},
	async (request: CallableRequest<CalculateRankingsRequest>) => {
		try {
			// Validate authentication
			if (!request.auth) {
				throw new Error('Authentication required')
			}

			// Check if user is admin
			const firestore = getFirestore()
			const playerDoc = await firestore
				.collection(Collections.PLAYERS)
				.doc(request.auth.uid)
				.get()

			if (!playerDoc.exists || !playerDoc.data()?.admin) {
				throw new Error('Admin privileges required')
			}

			// Validate request data
			const validatedData = calculateRankingsSchema.parse(request.data)
			const {
				calculationType,
				applyDecay,
				startSeasonId,
				startWeek,
				onlyNewRounds,
			} = validatedData

			logger.info(`Starting Hall of Fame calculation: ${calculationType}`, {
				triggeredBy: request.auth.uid,
				applyDecay,
				startSeasonId,
				startWeek,
				onlyNewRounds,
			})

			// Create calculation state document
			const calculationId = await createCalculationState(
				calculationType,
				request.auth.uid,
				{ applyDecay, startSeasonId, startWeek, onlyNewRounds }
			)

			// Process the calculation and wait for completion
			try {
				await processRankingCalculation(calculationId, validatedData)

				return {
					calculationId,
					status: 'completed',
					message: 'Hall of Fame calculation completed successfully.',
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : 'Unknown error'
				const errorStack = error instanceof Error ? error.stack : undefined

				logger.error('Ranking calculation failed:', error)
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
					message: `Hall of Fame calculation failed: ${errorMessage}`,
				}
			}
		} catch (error) {
			logger.error('Error starting Hall of Fame calculation:', error)
			throw error
		}
	}
)

/**
 * Main calculation processing logic
 */
async function processRankingCalculation(
	calculationId: string,
	config: CalculateRankingsRequest
): Promise<void> {
	const firestore = getFirestore()

	try {
		await updateCalculationState(calculationId, {
			status: 'running',
			'progress.currentStep': 'Loading seasons and games...',
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

		logger.info(`Found ${seasons.length} seasons for processing`)

		await updateCalculationState(calculationId, {
			'progress.totalSeasons': seasons.length,
		})

		// Determine starting point for calculation
		let startSeasonIndex = 0
		let existingPlayerRatings = new Map<string, PlayerRatingState>()
		let incrementalStartSeasonIndex: number | undefined
		let incrementalStartWeek: number | undefined

		if (config.calculationType === 'incremental') {
			const result = await determineIncrementalStartPoint(
				config.startSeasonId,
				config.startWeek
			)
			startSeasonIndex = result.seasonIndex
			existingPlayerRatings = result.playerRatings

			// Track the incremental start point for game counting
			incrementalStartSeasonIndex = result.seasonIndex
			incrementalStartWeek = result.week
		}

		// Load all games for processing
		const allGames = await loadGamesForCalculation(seasons, startSeasonIndex)
		logger.info(`Loaded ${allGames.length} games for processing`)

		await updateCalculationState(calculationId, {
			'progress.currentStep': 'Processing games and calculating ratings...',
		})

		// Process games chronologically
		const playerRatings = new Map(existingPlayerRatings)
		logger.info(`Starting with ${playerRatings.size} existing player ratings`)

		// Apply inactivity decay if enabled (BEFORE processing games)
		if (config.applyDecay) {
			await updateCalculationState(calculationId, {
				'progress.currentStep': 'Applying inactivity decay...',
			})

			const currentSeasonId = seasons[seasons.length - 1]?.id
			const allSeasonIds = seasons.map((s) => s.id)
			applyInactivityDecay(playerRatings, currentSeasonId, allSeasonIds)
		}

		// Choose processing method based on calculation type
		if (config.calculationType === 'round-based') {
			// Round-based processing: process games by rounds in chronological order
			if (config.onlyNewRounds) {
				await processNewRoundsOnly(
					allGames,
					playerRatings,
					calculationId,
					seasons.length,
					incrementalStartSeasonIndex,
					incrementalStartWeek
				)
			} else {
				await processGamesByRounds(
					allGames,
					playerRatings,
					calculationId,
					seasons.length,
					incrementalStartSeasonIndex,
					incrementalStartWeek
				)
			}
		} else {
			// Traditional chronological processing (by individual games)
			await processGamesChronologically(
				allGames,
				playerRatings,
				calculationId,
				seasons.length,
				incrementalStartSeasonIndex,
				incrementalStartWeek
			)
		}
		logger.info(
			`After processing games: ${playerRatings.size} players with ratings`
		)

		// Calculate final rankings and save
		await updateCalculationState(calculationId, {
			'progress.currentStep': 'Saving final rankings...',
			'progress.percentComplete': 95,
		})

		logger.info(`Calculated ratings for ${playerRatings.size} players`)
		await saveFinalRankings(playerRatings)
		logger.info('Final rankings saved successfully')

		// Mark calculation as complete
		await updateCalculationState(calculationId, {
			status: 'completed',
			completedAt: Timestamp.now(),
			'progress.currentStep': 'Complete',
			'progress.percentComplete': 100,
		})

		logger.info(
			`Hall of Fame calculation completed successfully: ${calculationId}`
		)
	} catch (error) {
		logger.error(`Hall of Fame calculation failed: ${calculationId}`, error)
		throw error
	}
}

/**
 * Get calculation status function (for monitoring progress)
 */
export const getCalculationStatus = onCall(
	{ region: 'us-central1' },
	async (request: CallableRequest<{ calculationId: string }>) => {
		if (!request.auth) {
			throw new Error('Authentication required')
		}

		const { calculationId } = request.data
		if (!calculationId) {
			throw new Error('Calculation ID required')
		}

		const firestore = getFirestore()
		const calculationDoc = await firestore
			.collection(Collections.RANKING_CALCULATIONS)
			.doc(calculationId)
			.get()

		if (!calculationDoc.exists) {
			throw new Error('Calculation not found')
		}

		return calculationDoc.data()
	}
)
