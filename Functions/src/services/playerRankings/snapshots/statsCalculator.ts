import { logger } from 'firebase-functions/v2'
import { TeamDocument } from '../../../types.js'
import { GameProcessingData, WeeklyStats } from '../types.js'
import { shouldCountGame } from '../incremental/gameCounter.js'

/**
 * Calculates weekly stats by processing the games
 * @param weeklyGames - Games to process for this week
 * @param incrementalStartSeasonIndex - For incremental calculations, the starting season index
 * @param incrementalStartWeek - For incremental calculations, the starting week
 * @param totalSeasons - Total number of seasons (for proper seasonOrder conversion)
 */
export async function calculateWeeklyStats(
	weeklyGames: GameProcessingData[],
	incrementalStartSeasonIndex?: number,
	incrementalStartWeek?: number,
	totalSeasons?: number
): Promise<Map<string, WeeklyStats>> {
	const weeklyStats = new Map<string, WeeklyStats>()

	// Process each game to calculate player weekly stats
	for (const game of weeklyGames) {
		if (
			!game.home ||
			!game.away ||
			game.homeScore === null ||
			game.awayScore === null
		) {
			continue
		}

		// Determine if this game should count
		const shouldCount = shouldCountGame(
			game,
			incrementalStartSeasonIndex,
			incrementalStartWeek,
			totalSeasons
		)

		try {
			// Get team rosters for this game
			const [homeTeamDoc, awayTeamDoc] = await Promise.all([
				game.home.get(),
				game.away.get(),
			])

			if (homeTeamDoc.exists && awayTeamDoc.exists) {
				const homeTeamData = homeTeamDoc.data() as TeamDocument
				const awayTeamData = awayTeamDoc.data() as TeamDocument

				// Process home team players
				for (const rosterPlayer of homeTeamData.roster || []) {
					const playerId = rosterPlayer.player.id
					const stats = weeklyStats.get(playerId) || {
						gamesPlayed: 0,
						pointDifferential: 0,
					}

					if (shouldCount) {
						stats.gamesPlayed++
					}
					// Always track point differential for rating calculations
					stats.pointDifferential += game.homeScore - game.awayScore
					weeklyStats.set(playerId, stats)
				}

				// Process away team players
				for (const rosterPlayer of awayTeamData.roster || []) {
					const playerId = rosterPlayer.player.id
					const stats = weeklyStats.get(playerId) || {
						gamesPlayed: 0,
						pointDifferential: 0,
					}

					if (shouldCount) {
						stats.gamesPlayed++
					}
					// Always track point differential for rating calculations
					stats.pointDifferential += game.awayScore - game.homeScore
					weeklyStats.set(playerId, stats)
				}
			}
		} catch (error) {
			logger.warn(`Failed to get team data for game ${game.id}:`, error)
		}
	}

	return weeklyStats
}
