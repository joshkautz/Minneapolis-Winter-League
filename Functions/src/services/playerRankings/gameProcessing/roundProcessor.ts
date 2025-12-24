import { logger } from 'firebase-functions/v2'
import { processGame } from './gameProcessor.js'
import { saveRoundSnapshot } from '../snapshots/roundSnapshotSaver.js'
import { applyRoundBasedDecay } from '../algorithms/decay.js'
import {
	updateGameProgress,
	updateSeasonalProgress,
} from '../persistence/progressTracker.js'
import { GameProcessingData, PlayerRatingState } from '../types.js'
import { groupGamesByRounds, formatRoundInfo } from './roundGrouper.js'

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
 * Processes all games by rounds in chronological order (full rebuild only).
 *
 * Each round contains all games that start at the same time.
 * This function always processes ALL rounds from scratch to ensure
 * accurate TrueSkill sigma (uncertainty) tracking.
 *
 * Note: Incremental updates were deprecated because TrueSkill requires
 * accurate sigma tracking across all games for proper rating calculations.
 */
export async function processGamesByRounds(
	games: GameProcessingData[],
	playerRatings: Map<string, PlayerRatingState>,
	calculationId: string,
	totalSeasons: number
): Promise<void> {
	// Group games into rounds by start time
	const allRounds = groupGamesByRounds(games)
	logger.info(`Grouped ${games.length} games into ${allRounds.length} rounds`)

	let currentSeasonId = ''
	let processedSeasons = 0
	let processedGames = 0

	for (let roundIndex = 0; roundIndex < allRounds.length; roundIndex++) {
		const round = allRounds[roundIndex]

		logger.info(
			`Processing round ${roundIndex + 1}/${allRounds.length}: ${formatRoundInfo(round)}`
		)

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
			preRoundRatings.set(playerId, playerState.mu)
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
			// In full rebuild mode, all games count for both rating and totalGames
			await processGame(
				game,
				playerRatings,
				true, // shouldCountForRating
				true // shouldCountForTotalGames
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

		logger.info(
			`Completed round ${round.roundId}: processed ${round.games.length} games`
		)

		// Update progress periodically
		await updateGameProgress(calculationId, processedGames, games.length)
	}

	logger.info(
		`Round-based processing complete: ${processedGames} games in ${allRounds.length} rounds`
	)
}
