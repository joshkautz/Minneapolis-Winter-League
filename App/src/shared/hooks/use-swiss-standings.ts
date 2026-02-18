/**
 * Swiss Standings Hook
 *
 * Calculates Swiss-style tournament standings from games
 * Swiss Score = Wins × 2 + Buchholz (sum of opponents' wins)
 * Tiebreaker = point differential
 */

import { useMemo } from 'react'
import { QuerySnapshot } from '@/firebase'
import { GameDocument, hasAssignedTeams } from '@/shared/utils'

/**
 * Swiss team standing with Buchholz calculation
 */
export interface SwissTeamStanding {
	/** Number of wins */
	wins: number
	/** Number of losses */
	losses: number
	/** Total points scored */
	pointsFor: number
	/** Total points allowed */
	pointsAgainst: number
	/** Point differential (pointsFor - pointsAgainst) */
	differential: number
	/** Buchholz score = sum of all opponents' wins */
	buchholzScore: number
	/** Swiss score = Wins × 2 + Buchholz */
	swissScore: number
	/** List of opponent team IDs */
	opponentIds: string[]
}

/**
 * Calculate Swiss standings from games
 *
 * @param gamesQuerySnapshot - Firestore query snapshot of games
 * @returns Object mapping teamId to SwissTeamStanding
 */
export const useSwissStandings = (
	gamesQuerySnapshot: QuerySnapshot<GameDocument> | undefined
): Record<string, SwissTeamStanding> => {
	const standings = useMemo(() => {
		// Step 1: Build basic team stats
		const teamStats: Record<
			string,
			{
				wins: number
				losses: number
				pointsFor: number
				pointsAgainst: number
				differential: number
				opponentIds: string[]
			}
		> = {}

		gamesQuerySnapshot?.docs.forEach((gameQueryDocumentSnapshot) => {
			const gameData = gameQueryDocumentSnapshot.data()

			// Skip games with null team references (placeholder games)
			if (!hasAssignedTeams(gameData)) {
				return
			}

			const { home, away, homeScore, awayScore } = gameData

			// Skip games that haven't been played yet (null scores)
			if (homeScore === null || awayScore === null) {
				return
			}

			const homeId = home.id
			const awayId = away.id

			// Initialize if not exists
			if (!teamStats[homeId]) {
				teamStats[homeId] = {
					wins: 0,
					losses: 0,
					pointsFor: 0,
					pointsAgainst: 0,
					differential: 0,
					opponentIds: [],
				}
			}
			if (!teamStats[awayId]) {
				teamStats[awayId] = {
					wins: 0,
					losses: 0,
					pointsFor: 0,
					pointsAgainst: 0,
					differential: 0,
					opponentIds: [],
				}
			}

			// Update home team
			teamStats[homeId].pointsFor += homeScore
			teamStats[homeId].pointsAgainst += awayScore
			teamStats[homeId].differential += homeScore - awayScore
			teamStats[homeId].opponentIds.push(awayId)
			if (homeScore > awayScore) {
				teamStats[homeId].wins++
			} else if (homeScore < awayScore) {
				teamStats[homeId].losses++
			}

			// Update away team
			teamStats[awayId].pointsFor += awayScore
			teamStats[awayId].pointsAgainst += homeScore
			teamStats[awayId].differential += awayScore - homeScore
			teamStats[awayId].opponentIds.push(homeId)
			if (awayScore > homeScore) {
				teamStats[awayId].wins++
			} else if (awayScore < homeScore) {
				teamStats[awayId].losses++
			}
		})

		// Step 2: Build team wins map for Buchholz calculation
		const teamWins: Record<string, number> = {}
		for (const teamId of Object.keys(teamStats)) {
			teamWins[teamId] = teamStats[teamId].wins
		}

		// Step 3: Calculate Buchholz and Swiss scores
		const result: Record<string, SwissTeamStanding> = {}

		for (const [teamId, stats] of Object.entries(teamStats)) {
			// Buchholz = sum of all opponents' wins
			const buchholzScore = stats.opponentIds.reduce((sum, opponentId) => {
				return sum + (teamWins[opponentId] || 0)
			}, 0)

			// Swiss Score = Wins × 2 + Buchholz
			const swissScore = stats.wins * 2 + buchholzScore

			result[teamId] = {
				wins: stats.wins,
				losses: stats.losses,
				pointsFor: stats.pointsFor,
				pointsAgainst: stats.pointsAgainst,
				differential: stats.differential,
				buchholzScore,
				swissScore,
				opponentIds: stats.opponentIds,
			}
		}

		return result
	}, [gamesQuerySnapshot])

	return standings
}

/**
 * Sort function for Swiss standings
 * Primary: Swiss Score (descending)
 * Tiebreaker: Point differential (descending)
 */
export const sortBySwissScore = (
	a: [string, SwissTeamStanding],
	b: [string, SwissTeamStanding]
): number => {
	// Primary: Swiss Score (descending)
	if (b[1].swissScore !== a[1].swissScore) {
		return b[1].swissScore - a[1].swissScore
	}
	// Tiebreaker: Point differential (descending)
	return b[1].differential - a[1].differential
}
