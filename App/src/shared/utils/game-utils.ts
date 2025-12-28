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
