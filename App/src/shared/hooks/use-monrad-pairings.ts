/**
 * Monrad Pairing Hook
 *
 * Generates Swiss-style pairings that avoid repeat matchups.
 * Teams are paired by similar ranking, but if they've already played,
 * the algorithm finds the next-closest opponent they haven't faced.
 */

import { useMemo } from 'react'
import { QuerySnapshot } from '@/firebase'
import { GameDocument, TeamDocument } from '@/types'
import { SwissTeamStanding, sortBySwissScore } from './use-swiss-standings'

export interface Pairing {
	/** Higher-ranked team ID */
	team1Id: string
	/** Lower-ranked team ID */
	team2Id: string
	/** Rank of team 1 */
	team1Rank: number
	/** Rank of team 2 */
	team2Rank: number
	/** Whether this is a repeat matchup (unavoidable) */
	isRepeat: boolean
}

export interface MonradPairingsResult {
	/** Generated pairings for the next round */
	pairings: Pairing[]
	/** Teams that couldn't be paired (odd number of teams) */
	bye: string | null
	/** Map of team ID to list of opponent IDs they've played */
	pastMatchups: Map<string, Set<string>>
}

/**
 * Build a map of past matchups from games
 */
const buildPastMatchupsMap = (
	gamesQuerySnapshot: QuerySnapshot<GameDocument> | undefined
): Map<string, Set<string>> => {
	const matchups = new Map<string, Set<string>>()

	gamesQuerySnapshot?.docs.forEach((doc) => {
		const game = doc.data()

		// Skip games without assigned teams or scores
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
 * Generate Monrad pairings
 *
 * Algorithm:
 * 1. Sort teams by Swiss score (current standings)
 * 2. For each unpaired team (starting from top rank):
 *    a. Find the closest-ranked opponent they haven't played
 *    b. If all opponents have been played, find closest-ranked available opponent
 *    c. Pair them and mark both as paired
 * 3. Continue until all teams are paired (or one bye if odd number)
 */
const generatePairings = (
	rankedTeams: { teamId: string; rank: number }[],
	pastMatchups: Map<string, Set<string>>
): { pairings: Pairing[]; bye: string | null } => {
	const pairings: Pairing[] = []
	const paired = new Set<string>()
	let bye: string | null = null

	// Handle odd number of teams - lowest ranked team gets bye
	const teamsToProcess = [...rankedTeams]
	if (teamsToProcess.length % 2 === 1) {
		const byeTeam = teamsToProcess.pop()!
		bye = byeTeam.teamId
	}

	for (const team of teamsToProcess) {
		// Skip if already paired
		if (paired.has(team.teamId)) continue

		const teamMatchups = pastMatchups.get(team.teamId) || new Set()

		// Find best opponent: closest rank, not already paired, preferably not played before
		let bestOpponent: { teamId: string; rank: number } | null = null
		let bestOpponentIsRepeat = false

		// First pass: find closest opponent not played before
		for (const candidate of teamsToProcess) {
			if (candidate.teamId === team.teamId) continue
			if (paired.has(candidate.teamId)) continue

			const hasPlayed = teamMatchups.has(candidate.teamId)

			if (!hasPlayed) {
				// Found an opponent we haven't played - this is ideal
				bestOpponent = candidate
				bestOpponentIsRepeat = false
				break // Take the first (closest ranked) one
			}
		}

		// Second pass: if everyone has been played, allow repeat
		if (!bestOpponent) {
			for (const candidate of teamsToProcess) {
				if (candidate.teamId === team.teamId) continue
				if (paired.has(candidate.teamId)) continue

				bestOpponent = candidate
				bestOpponentIsRepeat = true
				break // Take the first (closest ranked) one
			}
		}

		// Create pairing
		if (bestOpponent) {
			pairings.push({
				team1Id: team.teamId,
				team2Id: bestOpponent.teamId,
				team1Rank: team.rank,
				team2Rank: bestOpponent.rank,
				isRepeat: bestOpponentIsRepeat,
			})
			paired.add(team.teamId)
			paired.add(bestOpponent.teamId)
		}
	}

	return { pairings, bye }
}

/**
 * Hook to generate Monrad pairings based on current standings
 */
export const useMonradPairings = (
	standings: Record<string, SwissTeamStanding>,
	gamesQuerySnapshot: QuerySnapshot<GameDocument> | undefined,
	teamsQuerySnapshot: QuerySnapshot<TeamDocument> | undefined
): MonradPairingsResult => {
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

		// Build past matchups map
		const pastMatchups = buildPastMatchupsMap(gamesQuerySnapshot)

		// Generate pairings
		const { pairings, bye } = generatePairings(rankedTeams, pastMatchups)

		return {
			pairings,
			bye,
			pastMatchups,
		}
	}, [standings, gamesQuerySnapshot, teamsQuerySnapshot])
}

/**
 * Get the number of times two teams have played each other
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
