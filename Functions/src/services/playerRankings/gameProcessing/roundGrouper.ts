import { GameProcessingData } from '../types.js'

/**
 * Represents a round of games that start at the same time
 */
export interface GameRound {
	/** Unique identifier for the round (timestamp string) */
	roundId: string
	/** Start time of all games in this round */
	startTime: Date
	/** All games that start at this time */
	games: GameProcessingData[]
	/** Season ID for this round */
	seasonId: string
}

/**
 * Groups games by their exact start time to create rounds
 */
export function groupGamesByRounds(games: GameProcessingData[]): GameRound[] {
	// Map to group games by exact timestamp
	const roundsMap = new Map<string, GameRound>()

	for (const game of games) {
		// Create a round ID based on exact timestamp
		const roundId = game.gameDate.getTime().toString()

		if (!roundsMap.has(roundId)) {
			roundsMap.set(roundId, {
				roundId,
				startTime: game.gameDate,
				games: [],
				seasonId: game.season.id,
			})
		}

		roundsMap.get(roundId)!.games.push(game)
	}

	// Convert to array and sort by start time
	const rounds = Array.from(roundsMap.values())
	rounds.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

	return rounds
}

/**
 * Formats a round for logging purposes
 */
export function formatRoundInfo(round: GameRound): string {
	const timeStr = round.startTime.toISOString()
	const gameCount = round.games.length
	const seasonInfo = `Season ${round.seasonId}`

	return `${seasonInfo} - ${timeStr} (${gameCount} games)`
}
