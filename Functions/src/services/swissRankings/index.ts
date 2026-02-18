/**
 * Swiss Rankings Service
 *
 * Provides Swiss-style tournament ranking calculations
 */

export { calculateSwissRankings, getInitialSeedingRank } from './calculator.js'

export type {
	SwissTeamStats,
	SwissRanking,
	SwissRankingsResult,
} from './types.js'
