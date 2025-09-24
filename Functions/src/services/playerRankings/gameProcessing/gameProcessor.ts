import { logger } from 'firebase-functions/v2'
import { PlayerDocument, TeamDocument } from '../../../types.js'
import { ALGORITHM_CONSTANTS } from '../constants.js'
import { calculateExpectedScore } from '../algorithms/elo.js'
import { calculateWeightedPointDifferential } from '../algorithms/pointDifferential.js'
import { calculateTeamStrength } from '../algorithms/teamStrength.js'
import { initializePlayerRoundTracking } from '../algorithms/decay.js'
import { GameProcessingData, PlayerRatingState } from '../types.js'

/**
 * Processes a single game and updates player ratings
 */
export async function processGame(
	game: GameProcessingData,
	playerRatings: Map<string, PlayerRatingState>,
	shouldCountForRating: boolean = true, // Whether this game affects ELO calculations
	shouldCountForTotalGames: boolean = true // Whether to increment totalGames for this game
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
		playerRatings,
		shouldCountForRating,
		shouldCountForTotalGames
	)

	// Process each player on the away team
	await processPlayersInGame(
		awayTeamData.roster || [],
		game,
		-weightedDifferential, // Flip the differential for away team
		awayTeamStrength.averageRating,
		homeTeamStrength.averageRating,
		false, // isHomeTeam
		playerRatings,
		shouldCountForRating,
		shouldCountForTotalGames
	)
}

/**
 * Processes all players on a team for a specific game
 */
export async function processPlayersInGame(
	roster: Array<{ player: FirebaseFirestore.DocumentReference }>,
	game: GameProcessingData,
	pointDifferential: number,
	teamStrength: number,
	opponentStrength: number,
	isHomeTeam: boolean,
	playerRatings: Map<string, PlayerRatingState>,
	shouldCountForRating: boolean = true, // Whether this game affects ELO calculations
	shouldCountForTotalGames: boolean = true // Whether to increment totalGames for this game
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
				totalSeasons: 0,
				seasonsPlayed: new Set(),
				lastSeasonId: null,
				lastGameDate: null,
				roundsSinceLastGame: 0,
			}

			// Initialize round tracking for new player
			initializePlayerRoundTracking(playerState, game.gameDate)
			playerRatings.set(playerId, playerState)
		}

		// Calculate expected outcome based on team strengths
		const expectedScore = calculateExpectedScore(teamStrength, opponentStrength)

		// Actual score is based on point differential (normalized to 0-1 scale)
		// 40-minute ultimate games: ~20 total points (11-9, 12-8 typical scores)
		// More conservative normalization for lower-scoring format
		const actualScore = 0.5 + pointDifferential / 80 // Adjusted from /60 for 20-point games
		const clampedActualScore = Math.max(0, Math.min(1, actualScore))

		// Calculate Elo rating change
		const kFactor =
			ALGORITHM_CONSTANTS.K_FACTOR * seasonDecayFactor * playoffMultiplier
		const ratingChange = kFactor * (clampedActualScore - expectedScore)

		// Update player rating only if this game should count for rating calculations
		if (shouldCountForRating) {
			playerState.currentRating += ratingChange
		}

		// Increment totalGames if this game should count for totalGames tracking
		if (shouldCountForTotalGames) {
			playerState.totalGames++
		}

		playerState.lastSeasonId = game.season.id

		// Track season participation for totalSeasons calculation
		if (!playerState.seasonsPlayed.has(game.season.id)) {
			playerState.seasonsPlayed.add(game.season.id)
			playerState.totalSeasons = playerState.seasonsPlayed.size
		}
	}
}
