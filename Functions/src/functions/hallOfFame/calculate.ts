/**
 * Hall of Fame calculation Firebase Functions
 *
 * These functions handle the manual triggering and processing of player rankings
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { CallableRequest, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { z } from 'zod'
import {
	Collections,
	GameDocument,
	SeasonDocument,
	RankingHistoryDocument,
	RankingCalculationDocument,
	WeeklyPlayerRanking,
} from '../../types.js'
import {
	ALGORITHM_CONSTANTS,
	GameProcessingData,
	PlayerRatingState,
	processGame,
	applyInactivityDecay,
	calculatePlayerRankings,
	createWeeklySnapshot,
} from '../../services/hallOfFame.js'

// Validation schemas
const calculateRankingsSchema = z.object({
	calculationType: z.enum(['full', 'incremental']),
	applyDecay: z.boolean().default(true),
	startSeasonId: z.string().optional(),
	startWeek: z.number().optional(),
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
			const { calculationType, applyDecay, startSeasonId, startWeek } =
				validatedData

			logger.info(`Starting Hall of Fame calculation: ${calculationType}`, {
				triggeredBy: request.auth.uid,
				applyDecay,
				startSeasonId,
				startWeek,
			})

			// Create calculation state document
			const calculationId = await createCalculationState(
				calculationType,
				request.auth.uid,
				{ applyDecay, startSeasonId, startWeek }
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
 * Creates a new calculation state document
 */
async function createCalculationState(
	calculationType: 'full' | 'incremental',
	userId: string,
	parameters: any
): Promise<string> {
	const firestore = getFirestore()

	const calculationDoc: Partial<RankingCalculationDocument> = {
		calculationType,
		status: 'pending',
		startedAt: Timestamp.now(),
		completedAt: null,
		triggeredBy: userId,
		progress: {
			currentStep: 'Initializing...',
			percentComplete: 0,
			totalSeasons: 0,
			seasonsProcessed: 0,
		},
		parameters: {
			applyDecay: parameters.applyDecay ?? true,
			seasonDecayFactor: ALGORITHM_CONSTANTS.SEASON_DECAY_FACTOR,
			playoffMultiplier: ALGORITHM_CONSTANTS.PLAYOFF_MULTIPLIER,
			kFactor: ALGORITHM_CONSTANTS.K_FACTOR,
			// Only include defined values to avoid Firestore undefined value errors
			...(parameters.startSeasonId !== undefined && {
				startSeasonId: parameters.startSeasonId,
			}),
			...(parameters.startWeek !== undefined && {
				startWeek: parameters.startWeek,
			}),
		},
	}

	const docRef = await firestore
		.collection(Collections.RANKING_CALCULATIONS)
		.add(calculationDoc)

	return docRef.id
}

/**
 * Updates calculation state
 */
async function updateCalculationState(
	calculationId: string,
	updates: Partial<RankingCalculationDocument>
): Promise<void> {
	const firestore = getFirestore()
	await firestore
		.collection(Collections.RANKING_CALCULATIONS)
		.doc(calculationId)
		.update(updates)
}

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

		if (config.calculationType === 'incremental') {
			const result = await determineIncrementalStartPoint(
				config.startSeasonId,
				config.startWeek
			)
			startSeasonIndex = result.seasonIndex
			existingPlayerRatings = result.playerRatings
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

		await processGamesChronologically(
			allGames,
			playerRatings,
			calculationId,
			seasons.length
		)

		logger.info(
			`After processing games: ${playerRatings.size} players with ratings`
		)

		// Apply inactivity decay if enabled
		if (config.applyDecay) {
			await updateCalculationState(calculationId, {
				'progress.currentStep': 'Applying inactivity decay...',
			})

			const currentSeasonId = seasons[seasons.length - 1]?.id
			const allSeasonIds = seasons.map((s) => s.id)
			applyInactivityDecay(playerRatings, currentSeasonId, allSeasonIds)
		}

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
 * Determines the starting point for incremental calculations
 */
async function determineIncrementalStartPoint(
	startSeasonId?: string,
	startWeek?: number
): Promise<{
	seasonIndex: number
	week: number
	playerRatings: Map<string, PlayerRatingState>
}> {
	const firestore = getFirestore()

	// If no specific starting point, find the last completed snapshot
	if (!startSeasonId) {
		const lastSnapshotQuery = await firestore
			.collection(Collections.RANKING_HISTORY)
			.orderBy('snapshotDate', 'desc')
			.limit(1)
			.get()

		if (lastSnapshotQuery.empty) {
			// No previous snapshots, start from beginning
			return {
				seasonIndex: 0,
				week: 1,
				playerRatings: new Map(),
			}
		}

		const lastSnapshot =
			lastSnapshotQuery.docs[0].data() as RankingHistoryDocument
		// Get season index and convert snapshot to player ratings
		const seasonDoc = await lastSnapshot.season.get()
		const seasonsSnapshot = await firestore
			.collection(Collections.SEASONS)
			.orderBy('dateStart', 'asc')
			.get()

		const seasonIndex = seasonsSnapshot.docs.findIndex(
			(doc) => doc.id === seasonDoc.id
		)
		const playerRatings = convertSnapshotToRatings(lastSnapshot.rankings)

		return {
			seasonIndex: seasonIndex >= 0 ? seasonIndex : 0,
			week: lastSnapshot.week + 1,
			playerRatings,
		}
	}

	// TODO: Implement specific season/week starting point
	return {
		seasonIndex: 0,
		week: startWeek || 1,
		playerRatings: new Map(),
	}
}

/**
 * Converts a ranking snapshot back to player rating states
 */
function convertSnapshotToRatings(
	rankings: WeeklyPlayerRanking[]
): Map<string, PlayerRatingState> {
	const playerRatings = new Map<string, PlayerRatingState>()

	for (const ranking of rankings) {
		playerRatings.set(ranking.playerId, {
			playerId: ranking.playerId,
			playerName: ranking.playerName,
			currentRating: ranking.eloRating,
			totalGames: 0, // Will be recalculated
			seasonStats: new Map(),
			lastSeasonId: null,
			isActive: true,
		})
	}

	return playerRatings
}

/**
 * Loads all games for calculation starting from specified season
 */
async function loadGamesForCalculation(
	seasons: (SeasonDocument & { id: string })[],
	startSeasonIndex: number
): Promise<GameProcessingData[]> {
	const firestore = getFirestore()
	const allGames: GameProcessingData[] = []

	logger.info(
		`Loading games from ${seasons.length - startSeasonIndex} seasons (starting from index ${startSeasonIndex})`
	)

	for (let i = startSeasonIndex; i < seasons.length; i++) {
		const season = seasons[i]
		const seasonRef = firestore.collection(Collections.SEASONS).doc(season.id)

		const gamesSnapshot = await firestore
			.collection(Collections.GAMES)
			.where('season', '==', seasonRef)
			.orderBy('date', 'asc')
			.get()

		logger.info(`Season ${season.id}: Found ${gamesSnapshot.docs.length} games`)

		const seasonGames = gamesSnapshot.docs
			.map((doc) => {
				const gameData = doc.data() as GameDocument
				return {
					id: doc.id,
					...gameData,
					seasonOrder: seasons.length - 1 - i, // 0 = most recent
					week: calculateWeekNumber(gameData.date, season.dateStart),
					gameDate: gameData.date.toDate(),
				} as GameProcessingData
			})

		// Debug: Log a sample game to see the structure
		if (gamesSnapshot.docs.length > 0) {
			const sampleGameData = gamesSnapshot.docs[0].data()
			logger.info(`Sample game data for season ${season.id}:`, {
				gameId: gamesSnapshot.docs[0].id,
				homeScore: sampleGameData.homeScore,
				awayScore: sampleGameData.awayScore,
				home: sampleGameData.home ? 'has home team' : 'no home team',
				away: sampleGameData.away ? 'has away team' : 'no away team',
				allFields: Object.keys(sampleGameData)
			})
		}

		const completedGames = seasonGames.filter((game) => game.homeScore !== null && game.awayScore !== null)

		logger.info(
			`Season ${season.id}: ${completedGames.length} completed games after filtering`
		)
		allGames.push(...completedGames)
	}

	// Sort all games by date to ensure chronological processing
	allGames.sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime())

	return allGames
}

/**
 * Calculates week number within a season based on game date
 */
function calculateWeekNumber(
	gameDate: Timestamp,
	seasonStart: Timestamp
): number {
	const gameTime = gameDate.toDate().getTime()
	const seasonStartTime = seasonStart.toDate().getTime()
	const weeksDiff = Math.floor(
		(gameTime - seasonStartTime) / (7 * 24 * 60 * 60 * 1000)
	)
	return Math.max(1, weeksDiff + 1)
}

/**
 * Processes games chronologically and creates weekly snapshots
 */
async function processGamesChronologically(
	games: GameProcessingData[],
	playerRatings: Map<string, PlayerRatingState>,
	calculationId: string,
	totalSeasons: number
): Promise<void> {
	let currentSeasonId = ''
	let currentWeek = 0
	let weeklyGames: GameProcessingData[] = []
	let processedSeasons = 0

	for (let i = 0; i < games.length; i++) {
		const game = games[i]

		// Check if we've moved to a new week
		if (game.season.id !== currentSeasonId || game.week !== currentWeek) {
			// Save snapshot for the previous week if we have games
			if (weeklyGames.length > 0) {
				await saveWeeklySnapshot(
					currentSeasonId,
					currentWeek,
					playerRatings,
					weeklyGames
				)
			}

			// Update progress if we've moved to a new season
			if (game.season.id !== currentSeasonId) {
				if (currentSeasonId) processedSeasons++

				await updateCalculationState(calculationId, {
					'progress.currentStep': `Processing season ${processedSeasons + 1}/${totalSeasons}...`,
					'progress.percentComplete': Math.round(
						(processedSeasons / totalSeasons) * 90
					), // Leave 10% for final steps
					'progress.seasonsProcessed': processedSeasons,
					'progress.currentSeason': game.season.id,
				})
			}

			currentSeasonId = game.season.id
			currentWeek = game.week
			weeklyGames = []
		}

		// Process the game
		await processGame(game, playerRatings)
		weeklyGames.push(game)

		// Update progress periodically
		if (i % 100 === 0) {
			const overallProgress = Math.round((i / games.length) * 90)
			await updateCalculationState(calculationId, {
				'progress.percentComplete': overallProgress,
			})
		}
	}

	// Save the final week's snapshot
	if (weeklyGames.length > 0) {
		await saveWeeklySnapshot(
			currentSeasonId,
			currentWeek,
			playerRatings,
			weeklyGames
		)
	}
}

/**
 * Saves a weekly ranking snapshot
 */
async function saveWeeklySnapshot(
	seasonId: string,
	week: number,
	playerRatings: Map<string, PlayerRatingState>,
	weeklyGames: GameProcessingData[]
): Promise<void> {
	const firestore = getFirestore()
	const seasonRef = firestore.collection(Collections.SEASONS).doc(seasonId)

	// Calculate weekly stats
	const weeklyPlayerStats = calculateWeeklyStats(weeklyGames, playerRatings)
	const weeklyRankings = createWeeklySnapshot(playerRatings, weeklyPlayerStats)

	const snapshotDoc: Partial<RankingHistoryDocument> = {
		season: seasonRef as any,
		week,
		snapshotDate: Timestamp.now(),
		rankings: weeklyRankings,
		calculationMeta: {
			totalGamesProcessed: weeklyGames.length,
			avgRating: calculateAverageRating(playerRatings),
			activePlayerCount: Array.from(playerRatings.values()).filter(
				(p) => p.isActive
			).length,
			calculatedAt: Timestamp.now(),
		},
	}

	// Use composite ID for easy querying
	const snapshotId = `${seasonId}_week_${week}`
	await firestore
		.collection(Collections.RANKING_HISTORY)
		.doc(snapshotId)
		.set(snapshotDoc)
}

/**
 * Calculates weekly statistics for players
 */
function calculateWeeklyStats(
	weeklyGames: GameProcessingData[],
	playerRatings: Map<string, PlayerRatingState>
): Map<string, number> {
	const previousRatings = new Map<string, number>()

	// This is a simplified version - in a real implementation,
	// you'd want to track ratings before the week started
	for (const [playerId, state] of playerRatings) {
		previousRatings.set(playerId, state.currentRating)
	}

	return previousRatings
}

/**
 * Calculates average rating of all active players
 */
function calculateAverageRating(
	playerRatings: Map<string, PlayerRatingState>
): number {
	const activeRatings = Array.from(playerRatings.values())
		.filter((p) => p.isActive)
		.map((p) => p.currentRating)

	return activeRatings.length > 0
		? activeRatings.reduce((sum, rating) => sum + rating, 0) /
				activeRatings.length
		: ALGORITHM_CONSTANTS.STARTING_RATING
}

/**
 * Saves final player rankings to Firestore
 */
async function saveFinalRankings(
	playerRatings: Map<string, PlayerRatingState>
): Promise<void> {
	const firestore = getFirestore()
	const rankings = calculatePlayerRankings(playerRatings)

	// Use batch writes to update all rankings efficiently
	const batch = firestore.batch()

	for (const ranking of rankings) {
		// Create a clean ranking document without circular references
		const rankingDoc = {
			...ranking,
			// Remove the player reference that was causing issues
			player: firestore.collection(Collections.PLAYERS).doc(ranking.playerId),
			lastCalculated: Timestamp.now(),
		}

		// Use the actual player ID for the document ID
		const rankingRef = firestore
			.collection(Collections.RANKINGS)
			.doc(ranking.playerId)

		batch.set(rankingRef, rankingDoc)
	}

	await batch.commit()
	logger.info(`Saved ${rankings.length} player rankings to Firestore`)
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
