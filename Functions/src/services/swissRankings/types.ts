/**
 * Swiss Rankings Type Definitions
 *
 * Types for Swiss-style tournament ranking calculations
 */

/**
 * Intermediate stats used during calculation
 */
export interface SwissTeamStats {
	/** Team document ID */
	teamId: string
	/** Number of wins */
	wins: number
	/** Number of losses */
	losses: number
	/** Total points scored */
	pointsFor: number
	/** Total points allowed */
	pointsAgainst: number
	/** Point differential (pointsFor - pointsAgainst) */
	pointDifferential: number
	/** List of opponent team IDs played against */
	opponentIds: string[]
}

/**
 * Final Swiss ranking for a team
 */
export interface SwissRanking {
	/** Team document ID */
	teamId: string
	/** Calculated rank position (1-based) */
	rank: number
	/** Number of wins */
	wins: number
	/** Number of losses */
	losses: number
	/** Buchholz score = sum of all opponents' wins */
	buchholzScore: number
	/** Swiss score = Wins × 2 + Buchholz */
	swissScore: number
	/** Point differential (tiebreaker) */
	pointDifferential: number
	/** Points scored */
	pointsFor: number
	/** Points allowed */
	pointsAgainst: number
	/** List of opponent team IDs */
	opponentIds: string[]
}

/**
 * Result of the Swiss rankings calculation
 */
export interface SwissRankingsResult {
	/** Array of team rankings sorted by Swiss score */
	rankings: SwissRanking[]
	/** Map of teamId to wins (used for Buchholz calculation) */
	teamWins: Map<string, number>
}
