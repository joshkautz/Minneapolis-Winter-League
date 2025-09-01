/**
 * Game-related utility functions for Firebase Functions
 */

import {
	GameDocument,
	GameType,
	DocumentReference,
	SeasonDocument,
	Timestamp,
} from '../types.js'

/**
 * Type guard to check if a game has assigned teams (not a placeholder game)
 */
export const hasAssignedTeams = (game: GameDocument): boolean => {
	return game.home !== null && game.away !== null
}

/**
 * Type guard to check if a game is a placeholder game
 */
export const isPlaceholderGame = (game: GameDocument): boolean => {
	return game.home === null || game.away === null
}

/**
 * Helper to create a placeholder game structure
 */
export const createPlaceholderGame = (
	season: DocumentReference<SeasonDocument>,
	date: Timestamp,
	field: number,
	type: GameType = GameType.PLAYOFF
): Omit<GameDocument, 'id'> => {
	return {
		away: null,
		awayScore: 0,
		date,
		field,
		home: null,
		homeScore: 0,
		season,
		type,
	}
}
