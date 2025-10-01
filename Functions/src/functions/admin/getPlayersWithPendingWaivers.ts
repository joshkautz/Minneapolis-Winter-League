/**
 * Get players with pending waivers callable function
 *
 * This function is only invoked via the Admin Dashboard.
 * It retrieves all players who have paid for registration but haven't signed their waiver
 * for the current season.
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerDocument } from '../../types.js'
import { validateAdminUser } from '../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { getCurrentSeason } from '../../shared/database.js'

/**
 * Request interface - no parameters needed
 */
interface GetPlayersWithPendingWaiversRequest {
	// Empty - operates on current season by default
}

/**
 * Individual player with pending waiver info
 */
interface PlayerWithPendingWaiver {
	/** Player's unique ID (Firebase Auth UID) */
	uid: string
	/** Player's first name */
	firstname: string
	/** Player's last name */
	lastname: string
	/** Player's email address */
	email: string
	/** Team name (if rostered) */
	teamName: string | null
	/** Team ID (if rostered) */
	teamId: string | null
}

/**
 * Response interface for getting players with pending waivers
 */
interface GetPlayersWithPendingWaiversResponse {
	success: boolean
	message: string
	/** Season ID that was checked */
	seasonId: string
	/** Season name that was checked */
	seasonName: string
	/** Array of players with pending waivers */
	players: PlayerWithPendingWaiver[]
	/** Total count of players with pending waivers */
	count: number
}

/**
 * Retrieves all players who have paid for registration but haven't signed their waiver
 * for the current season
 *
 * Security validations performed:
 * - User must be authenticated with verified email
 * - User must have admin privileges
 *
 * Features:
 * - Checks current season only
 * - Returns player name, email, UID, and team info
 * - Ordered by last name
 */
export const getPlayersWithPendingWaivers =
	onCall<GetPlayersWithPendingWaiversRequest>(
		{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
		async (request) => {
			try {
				const { auth: authContext } = request
				const firestore = getFirestore()

				// Validate admin authentication
				await validateAdminUser(authContext, firestore)

				const userId = authContext!.uid

				logger.info('Getting players with pending waivers', {
					adminUserId: userId,
				})

				// Get current season
				const currentSeason = await getCurrentSeason()
				if (!currentSeason) {
					throw new Error('No current season found')
				}

				logger.info('Current season identified', {
					seasonId: currentSeason.id,
					seasonName: currentSeason.name,
				})

				// Get all players
				const playersSnapshot = await firestore
					.collection(Collections.PLAYERS)
					.get()

				const playersWithPendingWaivers: PlayerWithPendingWaiver[] = []

				// Process each player
				for (const playerDoc of playersSnapshot.docs) {
					const playerData = playerDoc.data() as PlayerDocument
					const playerId = playerDoc.id

					// Find current season data for this player
					const currentSeasonData = playerData.seasons?.find(
						(season) => season.season.id === currentSeason.id
					)

					// Check if player has paid but not signed
					if (currentSeasonData?.paid && !currentSeasonData?.signed) {
						// Get team name if player is rostered
						let teamName: string | null = null
						let teamId: string | null = null

						if (currentSeasonData.team) {
							try {
								const teamDoc = await currentSeasonData.team.get()
								if (teamDoc.exists) {
									teamName = teamDoc.data()?.name || null
									teamId = teamDoc.id
								}
							} catch (error) {
								logger.warn(`Failed to fetch team for player ${playerId}`, {
									error,
								})
							}
						}

						playersWithPendingWaivers.push({
							uid: playerId,
							firstname: playerData.firstname,
							lastname: playerData.lastname,
							email: playerData.email,
							teamName,
							teamId,
						})

						logger.debug('Found player with pending waiver', {
							playerId,
							playerName: `${playerData.firstname} ${playerData.lastname}`,
						})
					}
				}

				// Sort by last name
				playersWithPendingWaivers.sort((a, b) =>
					a.lastname.localeCompare(b.lastname)
				)

				logger.info('Successfully retrieved players with pending waivers', {
					count: playersWithPendingWaivers.length,
					seasonId: currentSeason.id,
				})

				return {
					success: true,
					message: `Found ${playersWithPendingWaivers.length} player(s) with pending waivers`,
					seasonId: currentSeason.id,
					seasonName: currentSeason.name,
					players: playersWithPendingWaivers,
					count: playersWithPendingWaivers.length,
				} as GetPlayersWithPendingWaiversResponse
			} catch (error) {
				logger.error('Error getting players with pending waivers', {
					error,
				})
				throw error
			}
		}
	)
