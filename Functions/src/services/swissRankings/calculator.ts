/**
 * Swiss Rankings Calculator
 *
 * Calculates Swiss-style tournament rankings using the formula:
 * Swiss Score = Wins × 2 + Buchholz
 *
 * Buchholz = sum of all opponents' wins (strength of schedule)
 * Tiebreaker = point differential
 */

import { GameDocument } from '../../types.js'
import { SwissTeamStats, SwissRanking, SwissRankingsResult } from './types.js'

/**
 * Calculate Swiss rankings for all teams in a season
 *
 * Algorithm:
 * 1. Calculate each team's wins, losses, point differential
 * 2. Track each team's opponents
 * 3. Calculate Buchholz = sum of all opponents' wins
 * 4. Calculate Swiss Score = Wins × 2 + Buchholz
 * 5. Sort by Swiss Score DESC, then point differential DESC
 * 6. Assign ranks (handle ties)
 *
 * @param games - Array of game documents for the season
 * @param teamIds - Array of all team IDs in the season (for teams with no games)
 * @returns Swiss rankings result with sorted rankings array
 */
export function calculateSwissRankings(
	games: GameDocument[],
	teamIds: string[]
): SwissRankingsResult {
	// Step 1: Build team stats from games
	const teamStats = new Map<string, SwissTeamStats>()

	// Initialize all teams with empty stats
	for (const teamId of teamIds) {
		teamStats.set(teamId, {
			teamId,
			wins: 0,
			losses: 0,
			pointsFor: 0,
			pointsAgainst: 0,
			pointDifferential: 0,
			opponentIds: [],
		})
	}

	// Process each completed game
	for (const game of games) {
		// Skip games without assigned teams or completed scores
		if (
			!game.home ||
			!game.away ||
			game.homeScore === null ||
			game.awayScore === null
		) {
			continue
		}

		const homeId = game.home.id
		const awayId = game.away.id
		const homeScore = game.homeScore
		const awayScore = game.awayScore

		// Update home team stats
		const homeStats = teamStats.get(homeId) || createEmptyStats(homeId)
		homeStats.pointsFor += homeScore
		homeStats.pointsAgainst += awayScore
		homeStats.pointDifferential += homeScore - awayScore
		if (homeScore > awayScore) {
			homeStats.wins++
		} else if (homeScore < awayScore) {
			homeStats.losses++
		}
		homeStats.opponentIds.push(awayId)
		teamStats.set(homeId, homeStats)

		// Update away team stats
		const awayStats = teamStats.get(awayId) || createEmptyStats(awayId)
		awayStats.pointsFor += awayScore
		awayStats.pointsAgainst += homeScore
		awayStats.pointDifferential += awayScore - homeScore
		if (awayScore > homeScore) {
			awayStats.wins++
		} else if (awayScore < homeScore) {
			awayStats.losses++
		}
		awayStats.opponentIds.push(homeId)
		teamStats.set(awayId, awayStats)
	}

	// Step 2: Build team wins map for Buchholz calculation
	const teamWins = new Map<string, number>()
	for (const [teamId, stats] of teamStats) {
		teamWins.set(teamId, stats.wins)
	}

	// Step 3: Calculate Buchholz and Swiss scores
	const rankings: SwissRanking[] = []
	for (const [teamId, stats] of teamStats) {
		// Buchholz = sum of all opponents' wins
		const buchholzScore = stats.opponentIds.reduce((sum, opponentId) => {
			return sum + (teamWins.get(opponentId) || 0)
		}, 0)

		// Swiss Score = Wins × 2 + Buchholz
		const swissScore = stats.wins * 2 + buchholzScore

		rankings.push({
			teamId,
			rank: 0, // Will be assigned after sorting
			wins: stats.wins,
			losses: stats.losses,
			buchholzScore,
			swissScore,
			pointDifferential: stats.pointDifferential,
			pointsFor: stats.pointsFor,
			pointsAgainst: stats.pointsAgainst,
			opponentIds: stats.opponentIds,
		})
	}

	// Step 4: Sort by Swiss Score DESC, then point differential DESC
	rankings.sort((a, b) => {
		// Primary: Swiss Score (descending)
		if (b.swissScore !== a.swissScore) {
			return b.swissScore - a.swissScore
		}
		// Tiebreaker: Point differential (descending)
		return b.pointDifferential - a.pointDifferential
	})

	// Step 5: Assign ranks (same rank for ties)
	let currentRank = 1
	for (let i = 0; i < rankings.length; i++) {
		if (i > 0) {
			const prev = rankings[i - 1]
			const curr = rankings[i]
			// Same rank if tied on both Swiss score and point differential
			if (
				curr.swissScore === prev.swissScore &&
				curr.pointDifferential === prev.pointDifferential
			) {
				curr.rank = prev.rank
			} else {
				curr.rank = currentRank
			}
		} else {
			rankings[i].rank = currentRank
		}
		currentRank++
	}

	return { rankings, teamWins }
}

/**
 * Create empty stats for a team
 */
function createEmptyStats(teamId: string): SwissTeamStats {
	return {
		teamId,
		wins: 0,
		losses: 0,
		pointsFor: 0,
		pointsAgainst: 0,
		pointDifferential: 0,
		opponentIds: [],
	}
}

/**
 * Get the initial seeding rank for a team (used when team has no games)
 *
 * @param teamId - Team document ID
 * @param swissInitialSeeding - Array of team IDs in seeding order
 * @returns Seed position (1-based) or null if not found
 */
export function getInitialSeedingRank(
	teamId: string,
	swissInitialSeeding: string[] | undefined
): number | null {
	if (!swissInitialSeeding || swissInitialSeeding.length === 0) {
		return null
	}
	const index = swissInitialSeeding.indexOf(teamId)
	return index >= 0 ? index + 1 : null
}
