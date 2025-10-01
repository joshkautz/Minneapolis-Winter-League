/**
 * Get player registration status callable function
 *
 * This function is only invoked via the Admin Dashboard.
 * It retrieves all players with their email verification status from Firebase Auth,
 * payment status, and waiver status for the current season.
 */

import { onCall } from 'firebase-functions/v2/https'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerDocument } from '../../types.js'
import { validateAdminUser } from '../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { getCurrentSeason } from '../../shared/database.js'

/**
 * Request interface - no parameters needed
 */
interface GetPlayerRegistrationStatusRequest {
	// Empty - operates on current season by default
}

/**
 * Individual player registration status
 */
interface PlayerRegistrationStatus {
	/** Player's unique ID (Firebase Auth UID) */
	id: string
	/** Player's first name */
	firstname: string
	/** Player's last name */
	lastname: string
	/** Player's email address */
	email: string
	/** Email verification status from Firebase Authentication */
	emailVerified: boolean
	/** Payment status for current season */
	paid: boolean
	/** Waiver signed status for current season */
	signed: boolean
	/** Team name (if rostered for current season) */
	teamName: string | null
	/** Team ID (if rostered for current season) */
	teamId: string | null
	/** Whether all registration steps are complete */
	isComplete: boolean
}

/**
 * Response interface for getting player registration status
 */
interface GetPlayerRegistrationStatusResponse {
	success: boolean
	message: string
	/** Season ID that was checked */
	seasonId: string
	/** Season name that was checked */
	seasonName: string
	/** Array of player registration statuses */
	players: PlayerRegistrationStatus[]
	/** Total count of players */
	count: number
}

/**
 * Retrieves all players with their registration status including:
 * - Email verification (from Firebase Auth)
 * - Payment status (from Firestore)
 * - Waiver status (from Firestore)
 *
 * Security validations performed:
 * - User must be authenticated with verified email
 * - User must have admin privileges
 *
 * Features:
 * - Checks current season only
 * - Returns comprehensive registration status
 * - Ordered by last name
 */
export const getPlayerRegistrationStatus =
	onCall<GetPlayerRegistrationStatusRequest>(
		{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
		async (request) => {
			try {
				const { auth: authContext } = request
				const firestore = getFirestore()
				const auth = getAuth()

				// Validate admin authentication
				await validateAdminUser(authContext, firestore)

				const userId = authContext!.uid

				logger.info('Getting player registration status', {
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

				// Get all players from Firestore
				const playersSnapshot = await firestore
					.collection(Collections.PLAYERS)
					.get()

				const playerStatuses: PlayerRegistrationStatus[] = []

				// Process each player
				for (const playerDoc of playersSnapshot.docs) {
					const playerData = playerDoc.data() as PlayerDocument
					const playerId = playerDoc.id

					try {
						// Get email verification status from Firebase Auth
						let emailVerified = false
						try {
							const authUser = await auth.getUser(playerId)
							emailVerified = authUser.emailVerified
						} catch (authError) {
							logger.warn(
								`Failed to fetch auth data for player ${playerId}. User may not exist in Firebase Auth.`,
								{ error: authError }
							)
							// Continue with emailVerified = false
						}

						// Find current season data for this player
						const currentSeasonData = playerData.seasons?.find(
							(season) => season.season.id === currentSeason.id
						)

						const paid = currentSeasonData?.paid || false
						const signed = currentSeasonData?.signed || false
						const isComplete = emailVerified && paid && signed

						// Get team name if player is rostered for current season
						let teamName: string | null = null
						let teamId: string | null = null

						if (currentSeasonData?.team) {
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

						playerStatuses.push({
							id: playerId,
							firstname: playerData.firstname,
							lastname: playerData.lastname,
							email: playerData.email,
							emailVerified,
							paid,
							signed,
							teamName,
							teamId,
							isComplete,
						})
					} catch (error) {
						logger.error(
							`Error processing player ${playerId} registration status`,
							{ error }
						)
						// Continue to next player
					}
				}

				// Sort by last name
				playerStatuses.sort((a, b) => a.lastname.localeCompare(b.lastname))

				logger.info('Successfully retrieved player registration status', {
					count: playerStatuses.length,
					seasonId: currentSeason.id,
				})

				return {
					success: true,
					message: `Found ${playerStatuses.length} player(s)`,
					seasonId: currentSeason.id,
					seasonName: currentSeason.name,
					players: playerStatuses,
					count: playerStatuses.length,
				} as GetPlayerRegistrationStatusResponse
			} catch (error) {
				logger.error('Error getting player registration status', {
					error,
				})
				throw error
			}
		}
	)
