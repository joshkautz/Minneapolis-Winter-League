import { logger } from 'firebase-functions/v2'
import { TeamDocument } from '../../../types.js'
import { ALGORITHM_CONSTANTS } from '../constants.js'
import { PlayerRatingState, TeamStrength } from '../types.js'

/**
 * Calculates team strength based on average player ratings at the time of the game
 */
export async function calculateTeamStrength(
	teamRef: FirebaseFirestore.DocumentReference,
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
