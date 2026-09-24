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

export interface SeasonRecord {
	wins: number
	losses: number
}

/**
 * A team's win-loss record in each season it played, keyed by season id.
 *
 * Keyed by season because a team keeps one id across the seasons it rolls
 * over into: tallying by team id alone adds every season's games into each
 * season's row. Counts every completed game the team played that season,
 * playoffs included. A tie credits neither side; unplayed games (no score)
 * and placeholder games (no teams) are skipped.
 */
export const teamRecordsBySeason = (
	games: GameDocument[],
	teamId: string
): Record<string, SeasonRecord> => {
	const records: Record<string, SeasonRecord> = {}

	for (const game of games) {
		const role = getTeamRole(game, teamId)
		if (!role) continue
		if (game.homeScore === null || game.awayScore === null) continue
		const seasonId = game.season?.id
		if (!seasonId) continue

		const ours = role === 'home' ? game.homeScore : game.awayScore
		const theirs = role === 'home' ? game.awayScore : game.homeScore

		const record = (records[seasonId] ??= { wins: 0, losses: 0 })
		if (ours > theirs) record.wins++
		else if (theirs > ours) record.losses++
	}

	return records
}

/**
 * Orders entries newest season first, by when each season starts — not by
 * name, which puts "2026 Spring" after "2026 Fall". Seasons with no known
 * start sort last.
 */
export const sortBySeasonStartDesc = <T>(
	entries: T[],
	seasonStartMillis: (entry: T) => number | undefined
): T[] =>
	[...entries].sort((a, b) => {
		const aStart = seasonStartMillis(a)
		const bStart = seasonStartMillis(b)
		if (aStart === undefined && bStart === undefined) return 0
		if (aStart === undefined) return 1
		if (bStart === undefined) return -1
		return bStart - aStart
	})
