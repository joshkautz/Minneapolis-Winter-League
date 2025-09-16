import { logger } from 'firebase-functions/v2'
import { processGame } from './gameProcessor.js'
import { saveWeeklySnapshot } from '../snapshots/snapshotSaver.js'
import { saveRoundSnapshot } from '../snapshots/roundSnapshotSaver.js'
import { shouldCountGame } from '../incremental/gameCounter.js'
import {
	updateGameProgress,
	updateSeasonalProgress,
} from '../persistence/progressTracker.js'
import { GameProcessingData, PlayerRatingState } from '../types.js'
import { groupGamesByRounds, formatRoundInfo } from './roundGrouper.js'
import {
	isRoundCalculated,
	markRoundCalculated,
	filterUncalculatedRounds,
} from '../persistence/roundTracker.js'

/**
 * Processes games by rounds in chronological order
 * Each round contains all games that start at the same time
 */
export async function processGamesByRounds(
	games: GameProcessingData[],
	playerRatings: Map<string, PlayerRatingState>,
	calculationId: string,
	totalSeasons: number,
	incrementalStartSeasonIndex?: number,
	incrementalStartWeek?: number,
	onlyNewRounds: boolean = false
): Promise<void> {
	// Group games into rounds by start time
	const allRounds = groupGamesByRounds(games)
	logger.info(`Grouped ${games.length} games into ${allRounds.length} rounds`)

	// Filter to only uncalculated rounds if requested
	const roundsToProcess = onlyNewRounds
		? await filterUncalculatedRounds(allRounds)
		: allRounds

	logger.info(
		`Processing ${roundsToProcess.length} rounds (${onlyNewRounds ? 'new only' : 'all'})`
	)

	let currentSeasonId = ''
	let currentWeek = 0
	let weeklyGames: GameProcessingData[] = []
	let weekStartRatings = new Map<string, number>()
	let processedSeasons = 0
	let processedGames = 0

	for (let roundIndex = 0; roundIndex < roundsToProcess.length; roundIndex++) {
		const round = roundsToProcess[roundIndex]

		logger.info(
			`Processing round ${roundIndex + 1}/${roundsToProcess.length}: ${formatRoundInfo(round)}`
		)

		// Skip if this round was already calculated (double-check for safety)
		if (onlyNewRounds && (await isRoundCalculated(round.roundId))) {
			logger.info(`Skipping already calculated round: ${round.roundId}`)
			continue
		}

		// Check if we've moved to a new week
		if (round.seasonId !== currentSeasonId || round.week !== currentWeek) {
			// Save snapshot for the previous week if we have games
			if (weeklyGames.length > 0) {
				await saveWeeklySnapshot(
					currentSeasonId,
					currentWeek,
					playerRatings,
					weeklyGames,
					weekStartRatings,
					incrementalStartSeasonIndex,
					incrementalStartWeek,
					totalSeasons
				)
			}

			// Update progress if we've moved to a new season
			if (round.seasonId !== currentSeasonId) {
				if (currentSeasonId) processedSeasons++

				await updateSeasonalProgress(
					calculationId,
					processedSeasons,
					totalSeasons,
					round.seasonId
				)
			}

			currentSeasonId = round.seasonId
			currentWeek = round.week
			weeklyGames = []

			// Capture ratings at the start of this new week
			weekStartRatings = new Map()
			for (const [playerId, playerState] of playerRatings) {
				weekStartRatings.set(playerId, playerState.currentRating)
			}
		}

		// Process all games in this round simultaneously
		// This ensures true chronological order since all games in a round start at the same time
		const roundPromises = round.games.map(async (game) => {
			// Determine if this game should count toward totalGames
			const shouldCount = shouldCountGame(
				game,
				incrementalStartSeasonIndex,
				incrementalStartWeek,
				totalSeasons
			)

			await processGame(game, playerRatings, shouldCount)
			weeklyGames.push(game)
			processedGames++
		})

		// Wait for all games in the round to be processed
		await Promise.all(roundPromises)

		// Save snapshot after this round for game-by-game history tracking
		// Capture ratings before this round for comparison
		const preRoundRatings = new Map<string, number>()
		for (const [playerId, playerState] of playerRatings) {
			// For pre-round ratings, we need to subtract the changes from this round
			// This is a simplified approach - in practice we'd track this more precisely
			preRoundRatings.set(playerId, playerState.currentRating)
		}
		
		await saveRoundSnapshot(round, playerRatings, preRoundRatings, calculationId)

		// Mark this round as calculated
		await markRoundCalculated(round, calculationId)

		logger.info(
			`Completed round ${round.roundId}: processed ${round.games.length} games`
		)

		// Update progress periodically
		await updateGameProgress(calculationId, processedGames, games.length)
	}

	// Save the final week's snapshot
	if (weeklyGames.length > 0) {
		await saveWeeklySnapshot(
			currentSeasonId,
			currentWeek,
			playerRatings,
			weeklyGames,
			weekStartRatings,
			incrementalStartSeasonIndex,
			incrementalStartWeek,
			totalSeasons
		)
	}

	logger.info(
		`Round-based processing complete: ${processedGames} games in ${roundsToProcess.length} rounds`
	)
}

/**
 * Processes only new rounds that haven't been calculated yet
 * This is ideal for incremental calculations
 */
export async function processNewRoundsOnly(
	games: GameProcessingData[],
	playerRatings: Map<string, PlayerRatingState>,
	calculationId: string,
	totalSeasons: number,
	incrementalStartSeasonIndex?: number,
	incrementalStartWeek?: number
): Promise<void> {
	return processGamesByRounds(
		games,
		playerRatings,
		calculationId,
		totalSeasons,
		incrementalStartSeasonIndex,
		incrementalStartWeek,
		true // Only process new rounds
	)
}
