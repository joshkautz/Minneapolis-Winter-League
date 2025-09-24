import { logger } from 'firebase-functions/v2'
import { processGame } from './gameProcessor.js'
import { saveRoundSnapshot } from '../snapshots/roundSnapshotSaver.js'
import { shouldCountGame } from '../incremental/gameCounter.js'
import { applyRoundBasedDecay } from '../algorithms/decay.js'
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
 * Extracts all player IDs participating in the games of a round
 */
async function getPlayersInRound(
	games: GameProcessingData[]
): Promise<Set<string>> {
	const playerIds = new Set<string>()

	for (const game of games) {
		if (!game.home || !game.away) continue

		try {
			// Get team documents
			const [homeTeamDoc, awayTeamDoc] = await Promise.all([
				game.home.get(),
				game.away.get(),
			])

			if (homeTeamDoc.exists && awayTeamDoc.exists) {
				const homeTeamData = homeTeamDoc.data()
				const awayTeamData = awayTeamDoc.data()

				// Add home team players
				if (homeTeamData?.roster) {
					for (const rosterEntry of homeTeamData.roster) {
						if (rosterEntry.player?.id) {
							playerIds.add(rosterEntry.player.id)
						}
					}
				}

				// Add away team players
				if (awayTeamData?.roster) {
					for (const rosterEntry of awayTeamData.roster) {
						if (rosterEntry.player?.id) {
							playerIds.add(rosterEntry.player.id)
						}
					}
				}
			}
		} catch (error) {
			logger.warn(`Error getting players for game ${game.id}:`, error)
		}
	}

	return playerIds
}

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
	onlyNewRounds: boolean = false,
	_isFullRebuild: boolean = false
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

		// Update progress if we've moved to a new season
		if (round.seasonId !== currentSeasonId) {
			if (currentSeasonId) processedSeasons++

			await updateSeasonalProgress(
				calculationId,
				processedSeasons,
				totalSeasons,
				round.seasonId
			)
			currentSeasonId = round.seasonId
		}

		// Capture ratings before this round for comparison
		const preRoundRatings = new Map<string, number>()
		for (const [playerId, playerState] of playerRatings) {
			preRoundRatings.set(playerId, playerState.currentRating)
		}

		// Collect all players participating in this round
		const playersInRound = await getPlayersInRound(round.games)

		// Apply round-based decay before processing games
		// This will increment inactivity counters for players not in this round
		// and reset counters for players who are playing
		applyRoundBasedDecay(playerRatings, round.startTime, playersInRound)

		// Process all games in this round simultaneously
		// This ensures true chronological order since all games in a round start at the same time
		const roundPromises = round.games.map(async (game) => {
			// Determine if this game should count toward ELO calculations
			const shouldCountForRating = shouldCountGame(
				game,
				incrementalStartSeasonIndex,
				totalSeasons
			)

			// For totalGames counting: Always count games being processed
			// - Full rebuild: count ALL games (since we're rebuilding from scratch)
			// - Incremental: count ALL games being processed (they're all new by definition)
			const shouldCountForTotalGames = true

			await processGame(
				game,
				playerRatings,
				shouldCountForRating,
				shouldCountForTotalGames
			)
			processedGames++
		})

		// Wait for all games in the round to be processed
		await Promise.all(roundPromises)

		// Save snapshot after this round for game-by-game history tracking
		await saveRoundSnapshot(
			round,
			playerRatings,
			preRoundRatings,
			calculationId
		)

		// Mark this round as calculated
		await markRoundCalculated(round, calculationId)

		logger.info(
			`Completed round ${round.roundId}: processed ${round.games.length} games`
		)

		// Update progress periodically
		await updateGameProgress(calculationId, processedGames, games.length)
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
	incrementalStartSeasonIndex?: number
): Promise<void> {
	return processGamesByRounds(
		games,
		playerRatings,
		calculationId,
		totalSeasons,
		incrementalStartSeasonIndex,
		true, // Only process new rounds
		false // This is incremental, not a full rebuild
	)
}
