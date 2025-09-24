/**
 * Game-related utility functions
 */

import { GameDocument, DocumentReference } from '@/types'

/**
 * Type guard to check if a game has assigned teams (not a placeholder game)
 */
export const hasAssignedTeams = (
	game: GameDocument
): game is GameDocument & {
	home: DocumentReference
	away: DocumentReference
} => {
	return game.home !== null && game.away !== null
}

/**
 * Type guard to check if a game is a placeholder game
 */
export const isPlaceholderGame = (game: GameDocument): boolean => {
	return game.home === null || game.away === null
}

/**
 * Get the opponent team reference for a given team in a game
 * Returns null if the game is a placeholder or if the team is not in the game
 */
export const getOpponentTeamRef = (
	game: GameDocument,
	teamId: string
): DocumentReference | null => {
	if (!hasAssignedTeams(game)) {
		return null
	}

	if (game.home.id === teamId) {
		return game.away
	}

	if (game.away.id === teamId) {
		return game.home
	}

	return null
}

/**
 * Determine if a team is the home or away team in a game
 */
export const getTeamRole = (
	game: GameDocument,
	teamId: string
): 'home' | 'away' | null => {
	if (!hasAssignedTeams(game)) {
		return null
	}

	if (game.home.id === teamId) {
		return 'home'
	}

	if (game.away.id === teamId) {
		return 'away'
	}

	return null
}
