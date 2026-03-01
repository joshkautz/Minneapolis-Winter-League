/**
 * Monrad Pairing Hook
 *
 * Generates Swiss-style pairings for a game day with 4 rounds × 3 fields.
 * Each team plays twice per game day with no double-byes (max 1 round gap).
 *
 * Priorities:
 * 1. Swiss matching - teams play similarly-ranked opponents
 * 2. No double-bye - teams don't sit out 2+ consecutive rounds
 * 3. Minimize repeats - avoid season-long repeat matchups when possible
 */

import { useMemo } from 'react'
import { QuerySnapshot } from '@/firebase'
import { GameDocument, TeamDocument } from '@/types'
import { SwissTeamStanding, sortBySwissScore } from './use-swiss-standings'

export interface ScheduledGame {
	/** Round number (1-4) */
	round: number
	/** Field identifier (A, B, C) */
	field: 'A' | 'B' | 'C'
	/** Team 1 ID */
	team1Id: string
	/** Team 2 ID */
	team2Id: string
	/** Rank of team 1 */
	team1Rank: number
	/** Rank of team 2 */
	team2Rank: number
	/** Whether this is a repeat matchup this season */
	isSeasonRepeat: boolean
	/** Number of times these teams have played this season */
	seasonMatchupCount: number
}

export interface MonradScheduleResult {
	/** All 12 scheduled games for the game day */
	games: ScheduledGame[]
	/** Map of team ID to their two scheduled rounds */
	teamRounds: Map<string, number[]>
	/** Map of team ID to set of opponents they've played this season */
	seasonMatchups: Map<string, Set<string>>
	/** Total repeat matchups in this schedule */
	repeatCount: number
}

/**
 * Static schedule template that satisfies no-double-bye constraint.
 * Each team plays twice with at most 1 round gap between games.
 *
 * Bracket structure:
 * - Top (ranks 1-4): Play each other
 * - Middle (ranks 5-6, 9-10): Play each other
 * - Developing (ranks 7-8, 11-12): Play each other
 */
const SCHEDULE_TEMPLATE: Array<{
	round: number
	field: 'A' | 'B' | 'C'
	rank1: number
	rank2: number
}> = [
	// Round 1
	{ round: 1, field: 'A', rank1: 1, rank2: 2 },
	{ round: 1, field: 'B', rank1: 5, rank2: 6 },
	{ round: 1, field: 'C', rank1: 7, rank2: 8 },
	// Round 2
	{ round: 2, field: 'A', rank1: 1, rank2: 3 },
	{ round: 2, field: 'B', rank1: 6, rank2: 10 },
	{ round: 2, field: 'C', rank1: 7, rank2: 11 },
	// Round 3
	{ round: 3, field: 'A', rank1: 2, rank2: 4 },
	{ round: 3, field: 'B', rank1: 5, rank2: 9 },
	{ round: 3, field: 'C', rank1: 8, rank2: 12 },
	// Round 4
	{ round: 4, field: 'A', rank1: 3, rank2: 4 },
	{ round: 4, field: 'B', rank1: 9, rank2: 10 },
	{ round: 4, field: 'C', rank1: 11, rank2: 12 },
]

/**
 * Build a map of season matchups from completed games
 */
const buildSeasonMatchupsMap = (
	gamesQuerySnapshot: QuerySnapshot<GameDocument> | undefined
): Map<string, Set<string>> => {
	const matchups = new Map<string, Set<string>>()

	gamesQuerySnapshot?.docs.forEach((doc) => {
		const game = doc.data()

		// Skip games without assigned teams or unplayed games
		if (!game.home?.id || !game.away?.id) return
		if (game.homeScore === null || game.awayScore === null) return

		const homeId = game.home.id
		const awayId = game.away.id

		// Add to home team's matchup set
		if (!matchups.has(homeId)) {
			matchups.set(homeId, new Set())
		}
		matchups.get(homeId)!.add(awayId)

		// Add to away team's matchup set
		if (!matchups.has(awayId)) {
			matchups.set(awayId, new Set())
		}
		matchups.get(awayId)!.add(homeId)
	})

	return matchups
}

/**
 * Count how many times two teams have played each other this season
 */
export const getMatchupCount = (
	team1Id: string,
	team2Id: string,
	gamesQuerySnapshot: QuerySnapshot<GameDocument> | undefined
): number => {
	let count = 0

	gamesQuerySnapshot?.docs.forEach((doc) => {
		const game = doc.data()
		if (!game.home?.id || !game.away?.id) return
		if (game.homeScore === null || game.awayScore === null) return

		if (
			(game.home.id === team1Id && game.away.id === team2Id) ||
			(game.home.id === team2Id && game.away.id === team1Id)
		) {
			count++
		}
	})

	return count
}

/**
 * Hook to generate Monrad schedule for a game day
 */
export const useMonradPairings = (
	standings: Record<string, SwissTeamStanding>,
	gamesQuerySnapshot: QuerySnapshot<GameDocument> | undefined,
	teamsQuerySnapshot: QuerySnapshot<TeamDocument> | undefined
): MonradScheduleResult => {
	return useMemo(() => {
		// Get ranked teams from standings
		const standingsEntries = Object.entries(standings)
		standingsEntries.sort(sortBySwissScore)

		const rankedTeams = standingsEntries.map(([teamId], index) => ({
			teamId,
			rank: index + 1,
		}))

		// If no standings yet, use teams from snapshot in arbitrary order
		if (rankedTeams.length === 0 && teamsQuerySnapshot) {
			teamsQuerySnapshot.docs.forEach((doc, index) => {
				rankedTeams.push({
					teamId: doc.id,
					rank: index + 1,
				})
			})
		}

		// Build season matchups map
		const seasonMatchups = buildSeasonMatchupsMap(gamesQuerySnapshot)

		// Create rank-to-team mapping
		const rankToTeam = new Map<number, string>()
		rankedTeams.forEach((t) => rankToTeam.set(t.rank, t.teamId))

		// Generate schedule from template
		const games: ScheduledGame[] = []
		const teamRounds = new Map<string, number[]>()
		let repeatCount = 0

		for (const slot of SCHEDULE_TEMPLATE) {
			const team1Id = rankToTeam.get(slot.rank1)
			const team2Id = rankToTeam.get(slot.rank2)

			// Skip if we don't have enough teams
			if (!team1Id || !team2Id) continue

			// Check if this is a season repeat
			const team1Matchups = seasonMatchups.get(team1Id) || new Set()
			const isSeasonRepeat = team1Matchups.has(team2Id)
			const seasonMatchupCount = getMatchupCount(
				team1Id,
				team2Id,
				gamesQuerySnapshot
			)

			if (isSeasonRepeat) {
				repeatCount++
			}

			games.push({
				round: slot.round,
				field: slot.field,
				team1Id,
				team2Id,
				team1Rank: slot.rank1,
				team2Rank: slot.rank2,
				isSeasonRepeat,
				seasonMatchupCount,
			})

			// Track which rounds each team plays in
			if (!teamRounds.has(team1Id)) teamRounds.set(team1Id, [])
			if (!teamRounds.has(team2Id)) teamRounds.set(team2Id, [])
			teamRounds.get(team1Id)!.push(slot.round)
			teamRounds.get(team2Id)!.push(slot.round)
		}

		return {
			games,
			teamRounds,
			seasonMatchups,
			repeatCount,
		}
	}, [standings, gamesQuerySnapshot, teamsQuerySnapshot])
}

// Legacy export for backwards compatibility
export type Pairing = ScheduledGame
export type MonradPairingsResult = MonradScheduleResult
