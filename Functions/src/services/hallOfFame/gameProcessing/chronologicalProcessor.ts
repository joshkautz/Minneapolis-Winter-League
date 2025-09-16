import { processGame } from './gameProcessor.js'
import { saveWeeklySnapshot } from '../snapshots/snapshotSaver.js'
import { shouldCountGame } from '../incremental/gameCounter.js'
import {
	updateGameProgress,
	updateSeasonalProgress,
} from '../persistence/progressTracker.js'
import { GameProcessingData, PlayerRatingState } from '../types.js'

/**
 * Processes games chronologically and creates weekly snapshots
 */
export async function processGamesChronologically(
	games: GameProcessingData[],
	playerRatings: Map<string, PlayerRatingState>,
	calculationId: string,
	totalSeasons: number,
	incrementalStartSeasonIndex?: number,
	incrementalStartWeek?: number
): Promise<void> {
	let currentSeasonId = ''
	let currentWeek = 0
	let weeklyGames: GameProcessingData[] = []
	let weekStartRatings = new Map<string, number>() // Track ratings at start of week
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
					weeklyGames,
					weekStartRatings,
					incrementalStartSeasonIndex,
					incrementalStartWeek,
					totalSeasons
				)
			}

			// Update progress if we've moved to a new season
			if (game.season.id !== currentSeasonId) {
				if (currentSeasonId) processedSeasons++

				await updateSeasonalProgress(
					calculationId,
					processedSeasons,
					totalSeasons,
					game.season.id
				)
			}

			currentSeasonId = game.season.id
			currentWeek = game.week
			weeklyGames = []

			// Capture ratings at the start of this new week
			weekStartRatings = new Map()
			for (const [playerId, playerState] of playerRatings) {
				weekStartRatings.set(playerId, playerState.currentRating)
			}
		}

		// Determine if this game should count toward totalGames
		const shouldCount = shouldCountGame(
			game,
			incrementalStartSeasonIndex,
			incrementalStartWeek,
			totalSeasons
		)

		// Process the game
		await processGame(game, playerRatings, shouldCount)
		weeklyGames.push(game)

		// Update progress periodically
		await updateGameProgress(calculationId, i, games.length)
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
}
