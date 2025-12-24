import { logger } from 'firebase-functions/v2'
import { PlayerDocument, TeamDocument } from '../../../types.js'
import { TRUESKILL_CONSTANTS } from '../constants.js'
import { TrueSkillRating, updateRatings } from '../algorithms/trueskill.js'
import { initializePlayerRoundTracking } from '../algorithms/decay.js'
import { GameProcessingData, PlayerRatingState } from '../types.js'

/**
 * Processes a single game and updates player ratings using TrueSkill algorithm
 */
export async function processGame(
	game: GameProcessingData,
	playerRatings: Map<string, PlayerRatingState>,
	shouldCountForRating: boolean = true,
	shouldCountForTotalGames: boolean = true
): Promise<void> {
	if (
		!game.home ||
		!game.away ||
		game.homeScore === null ||
		game.awayScore === null
	) {
		return // Skip incomplete games
	}

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

	const homeRoster = homeTeamData.roster || []
	const awayRoster = awayTeamData.roster || []

	if (homeRoster.length === 0 || awayRoster.length === 0) {
		logger.warn(`Empty roster for game ${game.id}`)
		return
	}

	// Determine game outcome (draws don't occur in this league)
	const homeWon = game.homeScore > game.awayScore

	// Calculate multipliers
	const playoffMultiplier =
		game.type === 'playoff' ? TRUESKILL_CONSTANTS.PLAYOFF_MULTIPLIER : 1.0
	const seasonDecayMultiplier = Math.pow(
		TRUESKILL_CONSTANTS.SEASON_DECAY_FACTOR,
		game.seasonOrder
	)
	const combinedMultiplier = playoffMultiplier * seasonDecayMultiplier

	// Ensure all players have rating states and collect their TrueSkill ratings
	const homePlayerStates: PlayerRatingState[] = []
	const awayPlayerStates: PlayerRatingState[] = []
	const homeRatings: TrueSkillRating[] = []
	const awayRatings: TrueSkillRating[] = []

	// Process home team players
	for (const rosterEntry of homeRoster) {
		const playerId = rosterEntry.player.id
		let playerState = playerRatings.get(playerId)

		if (!playerState) {
			// Create new player state
			const playerDoc = await rosterEntry.player.get()
			const playerData = playerDoc.data() as PlayerDocument

			playerState = {
				playerId,
				playerName: `${playerData.firstname} ${playerData.lastname}`,
				mu: TRUESKILL_CONSTANTS.INITIAL_MU,
				sigma: TRUESKILL_CONSTANTS.INITIAL_SIGMA,
				totalGames: 0,
				totalSeasons: 0,
				seasonsPlayed: new Set(),
				lastSeasonId: null,
				lastGameDate: null,
				roundsSinceLastGame: 0,
			}

			initializePlayerRoundTracking(playerState, game.gameDate)
			playerRatings.set(playerId, playerState)
		}

		homePlayerStates.push(playerState)
		homeRatings.push({ mu: playerState.mu, sigma: playerState.sigma })
	}

	// Process away team players
	for (const rosterEntry of awayRoster) {
		const playerId = rosterEntry.player.id
		let playerState = playerRatings.get(playerId)

		if (!playerState) {
			// Create new player state
			const playerDoc = await rosterEntry.player.get()
			const playerData = playerDoc.data() as PlayerDocument

			playerState = {
				playerId,
				playerName: `${playerData.firstname} ${playerData.lastname}`,
				mu: TRUESKILL_CONSTANTS.INITIAL_MU,
				sigma: TRUESKILL_CONSTANTS.INITIAL_SIGMA,
				totalGames: 0,
				totalSeasons: 0,
				seasonsPlayed: new Set(),
				lastSeasonId: null,
				lastGameDate: null,
				roundsSinceLastGame: 0,
			}

			initializePlayerRoundTracking(playerState, game.gameDate)
			playerRatings.set(playerId, playerState)
		}

		awayPlayerStates.push(playerState)
		awayRatings.push({ mu: playerState.mu, sigma: playerState.sigma })
	}

	// Only update ratings if this game should count
	if (shouldCountForRating) {
		// Determine winners and losers for TrueSkill update
		const winnerRatings = homeWon ? homeRatings : awayRatings
		const loserRatings = homeWon ? awayRatings : homeRatings
		const winnerStates = homeWon ? homePlayerStates : awayPlayerStates
		const loserStates = homeWon ? awayPlayerStates : homePlayerStates

		// Calculate TrueSkill updates
		const { winners: updatedWinners, losers: updatedLosers } = updateRatings(
			winnerRatings,
			loserRatings,
			combinedMultiplier
		)

		// Apply updates to winner states
		for (let i = 0; i < winnerStates.length; i++) {
			const playerState = winnerStates[i]
			const newRating = updatedWinners[i]
			playerState.mu = newRating.mu
			playerState.sigma = newRating.sigma
		}

		// Apply updates to loser states
		for (let i = 0; i < loserStates.length; i++) {
			const playerState = loserStates[i]
			const newRating = updatedLosers[i]
			playerState.mu = newRating.mu
			playerState.sigma = newRating.sigma
		}
	}

	// Update game counts and season tracking for all players
	const allPlayerStates = [...homePlayerStates, ...awayPlayerStates]
	for (const playerState of allPlayerStates) {
		if (shouldCountForTotalGames) {
			playerState.totalGames++
		}

		playerState.lastSeasonId = game.season.id

		// Track season participation
		if (!playerState.seasonsPlayed.has(game.season.id)) {
			playerState.seasonsPlayed.add(game.season.id)
			playerState.totalSeasons = playerState.seasonsPlayed.size
		}
	}
}
