/**
 * Hall of Fame Elo Rating System for Minneapolis Winter League
 *
 * This service implements a sophisticated player ranking algorithm that:
 * - Uses point differentials instead of wins/losses
 * - Applies diminishing returns to large point differentials
 * - Weights recent seasons exponentially higher
 * - Doubles points for playoff games
 * - Calculates team strength from average player ratings
 * - Uses Elo-style system where beating stronger teams awards more points
 * - Applies rating decay for inactive players
 */

import { Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	GameDocument,
	SeasonDocument,
	PlayerDocument,
	TeamDocument,
	PlayerRankingDocument,
	WeeklyPlayerRanking,
	PlayerSeasonStats,
} from '../types.js'

export interface GameProcessingData extends GameDocument {
	id: string
	seasonOrder: number // 0 = most recent season, 1 = previous, etc.
	week: number
	gameDate: Date
}

export interface PlayerRatingState {
	playerId: string
	playerName: string
	currentRating: number
	totalGames: number
	seasonStats: Map<string, PlayerSeasonStats>
	lastSeasonId: string | null
	isActive: boolean
}

export interface TeamStrength {
	teamId: string
	averageRating: number
	playerCount: number
	confidence: number // 0-1, based on how many rated players
}

/**
 * Hall of Fame Rating Algorithm Constants
 */
export const ALGORITHM_CONSTANTS = {
	// Starting Elo rating for new players
	STARTING_RATING: 1200,

	// K-factor for Elo calculation (how much ratings can change)
	K_FACTOR: 32,

	// Playoff game multiplier
	PLAYOFF_MULTIPLIER: 2.0,

	// Exponential decay factor per season (each season back is multiplied by this)
	SEASON_DECAY_FACTOR: 0.8,

	// Rating decay for inactive players (per season of inactivity)
	INACTIVITY_DECAY_PER_SEASON: 0.95,

	// Maximum point differential that gets full weight (diminishing returns beyond this)
	MAX_FULL_WEIGHT_DIFFERENTIAL: 10,

	// Minimum team confidence to use team-based strength calculation
	MIN_TEAM_CONFIDENCE: 0.5,

	// Default team strength when confidence is too low
	DEFAULT_TEAM_STRENGTH: 1200,

	// Number of seasons of inactivity before considering a player "retired"
	RETIREMENT_THRESHOLD_SEASONS: 3,
}

/**
 * Calculates a weighted point differential with diminishing returns
 * The idea is that losing by 1 vs 2 points should matter more than losing by 6 vs 7 points
 */
export function calculateWeightedPointDifferential(
	rawDifferential: number
): number {
	const absValue = Math.abs(rawDifferential)
	const sign = Math.sign(rawDifferential)

	if (absValue <= ALGORITHM_CONSTANTS.MAX_FULL_WEIGHT_DIFFERENTIAL) {
		return rawDifferential
	}

	// Apply logarithmic scaling for large differentials
	const scaledValue =
		ALGORITHM_CONSTANTS.MAX_FULL_WEIGHT_DIFFERENTIAL +
		Math.log(absValue - ALGORITHM_CONSTANTS.MAX_FULL_WEIGHT_DIFFERENTIAL + 1) *
			2

	return sign * scaledValue
}

/**
 * Calculates the expected score for player A against player B using Elo formula
 */
export function calculateExpectedScore(
	ratingA: number,
	ratingB: number
): number {
	return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}

/**
 * Calculates team strength based on average player ratings at the time of the game
 */
export async function calculateTeamStrength(
	teamRef: any,
	gameDate: Date,
	playerRatings: Map<string, PlayerRatingState>,
	seasonOrder: number
): Promise<TeamStrength> {
	try {
		const teamDoc = await teamRef.get()
		if (!teamDoc.exists) {
			return {
				teamId: teamRef.id,
				averageRating: ALGORITHM_CONSTANTS.DEFAULT_TEAM_STRENGTH,
				playerCount: 0,
				confidence: 0,
			}
		}

		const teamData = teamDoc.data() as TeamDocument
		const roster = teamData.roster || []

		let totalRating = 0
		let ratedPlayerCount = 0

		for (const rosterEntry of roster) {
			const playerId = rosterEntry.player.id
			const playerState = playerRatings.get(playerId)

			if (playerState) {
				// Apply season decay to historical ratings
				const decayFactor = Math.pow(
					ALGORITHM_CONSTANTS.SEASON_DECAY_FACTOR,
					seasonOrder
				)
				const adjustedRating =
					ALGORITHM_CONSTANTS.STARTING_RATING +
					(playerState.currentRating - ALGORITHM_CONSTANTS.STARTING_RATING) *
						decayFactor

				totalRating += adjustedRating
				ratedPlayerCount++
			} else {
				// Use starting rating for unrated players
				totalRating += ALGORITHM_CONSTANTS.STARTING_RATING
				ratedPlayerCount++
			}
		}

		const averageRating =
			ratedPlayerCount > 0
				? totalRating / ratedPlayerCount
				: ALGORITHM_CONSTANTS.DEFAULT_TEAM_STRENGTH
		const confidence = ratedPlayerCount / Math.max(roster.length, 1)

		return {
			teamId: teamRef.id,
			averageRating,
			playerCount: ratedPlayerCount,
			confidence,
		}
	} catch (error) {
		logger.error(
			`Error calculating team strength for team ${teamRef.id}:`,
			error
		)
		return {
			teamId: teamRef.id,
			averageRating: ALGORITHM_CONSTANTS.DEFAULT_TEAM_STRENGTH,
			playerCount: 0,
			confidence: 0,
		}
	}
}

/**
 * Processes a single game and updates player ratings
 */
export async function processGame(
	game: GameProcessingData,
	playerRatings: Map<string, PlayerRatingState>
): Promise<void> {
	if (
		!game.home ||
		!game.away ||
		game.homeScore === null ||
		game.awayScore === null
	) {
		return // Skip incomplete games
	}

	const pointDifferential = game.homeScore - game.awayScore
	const weightedDifferential =
		calculateWeightedPointDifferential(pointDifferential)

	// Calculate team strengths
	const homeTeamStrength = await calculateTeamStrength(
		game.home,
		game.gameDate,
		playerRatings,
		game.seasonOrder
	)
	const awayTeamStrength = await calculateTeamStrength(
		game.away,
		game.gameDate,
		playerRatings,
		game.seasonOrder
	)

	// Get rosters for both teams
	const [homeTeamDoc, awayTeamDoc] = await Promise.all([
		game.home.get(),
		game.away.get(),
	])

	if (!homeTeamDoc.exists || !awayTeamDoc.exists) {
		logger.warn(`Missing team data for game ${game.id}`)
		return
	}

	const homeTeamData = homeTeamDoc.data() as TeamDocument
	const awayTeamData = awayTeamDoc.data() as TeamDocument

	// Process each player on the home team
	await processPlayersInGame(
		homeTeamData.roster || [],
		game,
		weightedDifferential,
		homeTeamStrength.averageRating,
		awayTeamStrength.averageRating,
		true, // isHomeTeam
		playerRatings
	)

	// Process each player on the away team
	await processPlayersInGame(
		awayTeamData.roster || [],
		game,
		-weightedDifferential, // Flip the differential for away team
		awayTeamStrength.averageRating,
		homeTeamStrength.averageRating,
		false, // isHomeTeam
		playerRatings
	)
}

/**
 * Processes all players on a team for a specific game
 */
export async function processPlayersInGame(
	roster: any[],
	game: GameProcessingData,
	pointDifferential: number,
	teamStrength: number,
	opponentStrength: number,
	isHomeTeam: boolean,
	playerRatings: Map<string, PlayerRatingState>
): Promise<void> {
	const seasonDecayFactor = Math.pow(
		ALGORITHM_CONSTANTS.SEASON_DECAY_FACTOR,
		game.seasonOrder
	)
	const playoffMultiplier =
		game.type === 'playoff' ? ALGORITHM_CONSTANTS.PLAYOFF_MULTIPLIER : 1.0

	for (const rosterEntry of roster) {
		const playerId = rosterEntry.player.id

		// Get or create player rating state
		let playerState = playerRatings.get(playerId)
		if (!playerState) {
			// Create new player state
			const playerDoc = await rosterEntry.player.get()
			const playerData = playerDoc.data() as PlayerDocument

			playerState = {
				playerId,
				playerName: `${playerData.firstname} ${playerData.lastname}`,
				currentRating: ALGORITHM_CONSTANTS.STARTING_RATING,
				totalGames: 0,
				seasonStats: new Map(),
				lastSeasonId: null,
				isActive: true,
			}
			playerRatings.set(playerId, playerState)
		}

		// Calculate expected outcome based on team strengths
		const expectedScore = calculateExpectedScore(teamStrength, opponentStrength)

		// Actual score is based on point differential (normalized to 0-1 scale)
		// Positive differential = better than expected, negative = worse than expected
		const actualScore = 0.5 + pointDifferential / 100 // Rough normalization
		const clampedActualScore = Math.max(0, Math.min(1, actualScore))

		// Calculate Elo rating change
		const kFactor =
			ALGORITHM_CONSTANTS.K_FACTOR * seasonDecayFactor * playoffMultiplier
		const ratingChange = kFactor * (clampedActualScore - expectedScore)

		// Update player rating
		playerState.currentRating += ratingChange
		playerState.totalGames++
		playerState.lastSeasonId = game.season.id

		// Update season stats
		let seasonStats = playerState.seasonStats.get(game.season.id)
		if (!seasonStats) {
			const seasonDoc = await game.season.get()
			const seasonData = seasonDoc.data() as SeasonDocument

			seasonStats = {
				seasonId: game.season.id,
				seasonName: seasonData.name,
				gamesPlayed: 0,
				avgPointDifferential: 0,
				endOfSeasonRating: playerState.currentRating,
				teams: [],
			}
			playerState.seasonStats.set(game.season.id, seasonStats)
		}

		// Update season stats
		const previousTotal =
			seasonStats.avgPointDifferential * seasonStats.gamesPlayed
		seasonStats.gamesPlayed++
		seasonStats.avgPointDifferential =
			(previousTotal + pointDifferential) / seasonStats.gamesPlayed
		seasonStats.endOfSeasonRating = playerState.currentRating

		// Update team participation in season
		if (!game.home || !game.away) return // Safety check

		const teamId = isHomeTeam ? game.home.id : game.away.id
		const teamData = isHomeTeam
			? ((await game.home.get()).data() as TeamDocument)
			: ((await game.away.get()).data() as TeamDocument)

		let teamEntry = seasonStats.teams.find((t) => t.teamId === teamId)
		if (!teamEntry) {
			teamEntry = {
				teamId,
				teamName: teamData.name,
				gamesPlayed: 0,
			}
			seasonStats.teams.push(teamEntry)
		}
		teamEntry.gamesPlayed++
	}
}

/**
 * Applies rating decay for players who haven't played in recent seasons
 */
export function applyInactivityDecay(
	playerRatings: Map<string, PlayerRatingState>,
	currentSeasonId: string,
	allSeasonIds: string[]
): void {
	const currentSeasonIndex = allSeasonIds.indexOf(currentSeasonId)

	for (const [, playerState] of playerRatings) {
		if (!playerState.lastSeasonId) {
			continue
		}

		const lastSeasonIndex = allSeasonIds.indexOf(playerState.lastSeasonId)
		const seasonsInactive = currentSeasonIndex - lastSeasonIndex

		if (seasonsInactive > 0) {
			const decayFactor = Math.pow(
				ALGORITHM_CONSTANTS.INACTIVITY_DECAY_PER_SEASON,
				seasonsInactive
			)
			const ratingAboveBase =
				playerState.currentRating - ALGORITHM_CONSTANTS.STARTING_RATING
			playerState.currentRating =
				ALGORITHM_CONSTANTS.STARTING_RATING + ratingAboveBase * decayFactor

			// Mark as inactive if they haven't played in several seasons
			if (seasonsInactive >= ALGORITHM_CONSTANTS.RETIREMENT_THRESHOLD_SEASONS) {
				playerState.isActive = false
			}
		}
	}
}

/**
 * Converts player ratings map to ranked array
 */
export function calculatePlayerRankings(
	playerRatings: Map<string, PlayerRatingState>
): PlayerRankingDocument[] {
	const rankings = Array.from(playerRatings.values())
		.sort((a, b) => b.currentRating - a.currentRating)
		.map(
			(playerState, index) =>
				({
					player: null as any, // Will be set when saving to Firestore
					playerId: playerState.playerId,
					playerName: playerState.playerName,
					eloRating: Math.round(playerState.currentRating),
					totalGames: playerState.totalGames,
					totalSeasons: playerState.seasonStats.size,
					rank: index + 1,
					lastUpdated: Timestamp.now(),
					lastSeasonId: playerState.lastSeasonId,
					seasonStats: Array.from(playerState.seasonStats.values()),
					lastRatingChange: 0, // Will be calculated during updates
					isActive: playerState.isActive,
				}) as PlayerRankingDocument
		)

	return rankings
}

/**
 * Converts player ratings to weekly snapshot format
 */
export function createWeeklySnapshot(
	playerRatings: Map<string, PlayerRatingState>,
	previousRatings?: Map<string, number>
): WeeklyPlayerRanking[] {
	const rankings = Array.from(playerRatings.values())
		.sort((a, b) => b.currentRating - a.currentRating)
		.map((playerState, index) => {
			const previousRating =
				previousRatings?.get(playerState.playerId) || playerState.currentRating
			const weeklyChange = playerState.currentRating - previousRating

			return {
				playerId: playerState.playerId,
				playerName: playerState.playerName,
				eloRating: Math.round(playerState.currentRating),
				rank: index + 1,
				weeklyChange: Math.round(weeklyChange),
				gamesThisWeek: 0, // Will be calculated separately
				pointDifferentialThisWeek: 0, // Will be calculated separately
			}
		})

	return rankings
}
