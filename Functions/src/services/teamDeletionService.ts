/**
 * Team deletion service
 *
 * Shared service for deleting teams with full cleanup including:
 * - Player roster updates
 * - Offer deletion
 * - Storage logo deletion
 */

import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	TeamDocument,
	PlayerDocument,
	PlayerSeason,
} from '../types.js'

/**
 * Result of a team deletion operation
 */
export interface TeamDeletionResult {
	teamId: string
	teamName: string
	success: boolean
	playersUpdated: number
	offersDeleted: number
	logoDeleted: boolean
	error?: string
}

/**
 * Delete a single team with full cleanup
 *
 * Performs the following operations:
 * 1. Updates all roster players: team: null, captain: false
 * 2. Deletes all offers referencing the team
 * 3. Deletes team logo from Storage (fire-and-forget)
 * 4. Deletes the team document
 *
 * @param firestore - Firestore instance
 * @param teamRef - Reference to the team document
 * @param seasonId - The season ID for player updates
 * @param options - Optional settings
 * @param options.skipRegisteredCheck - Skip check for registered teams (for admin bulk deletion)
 */
export async function deleteTeamWithCleanup(
	firestore: FirebaseFirestore.Firestore,
	teamRef: FirebaseFirestore.DocumentReference<TeamDocument>,
	seasonId: string,
	options?: { skipRegisteredCheck?: boolean }
): Promise<TeamDeletionResult> {
	const teamId = teamRef.id
	let teamName = 'Unknown'
	let playersUpdated = 0
	let offersDeleted = 0
	let logoDeleted = false

	try {
		// Get team document first to retrieve info needed for cleanup
		const teamDoc = await teamRef.get()

		if (!teamDoc.exists) {
			return {
				teamId,
				teamName,
				success: false,
				playersUpdated: 0,
				offersDeleted: 0,
				logoDeleted: false,
				error: 'Team not found',
			}
		}

		const teamDocument = teamDoc.data() as TeamDocument | undefined

		if (!teamDocument) {
			return {
				teamId,
				teamName,
				success: false,
				playersUpdated: 0,
				offersDeleted: 0,
				logoDeleted: false,
				error: 'Unable to retrieve team data',
			}
		}

		teamName = teamDocument.name

		// Check if team is registered (unless skipping this check)
		if (!options?.skipRegisteredCheck && teamDocument.registered) {
			return {
				teamId,
				teamName,
				success: false,
				playersUpdated: 0,
				offersDeleted: 0,
				logoDeleted: false,
				error: 'Cannot delete a registered team',
			}
		}

		// Delete team logo from Storage (fire-and-forget)
		if (teamDocument.storagePath) {
			logoDeleted = await deleteTeamLogo(teamDocument.storagePath)
		}

		// Use transaction for player updates, offer deletion, and team deletion
		const result = await firestore.runTransaction(async (transaction) => {
			let playerCount = 0
			let offerCount = 0

			// Update all roster players: team: null, captain: false
			if (teamDocument.roster && teamDocument.roster.length > 0) {
				for (const member of teamDocument.roster) {
					const playerDoc = await transaction.get(member.player)
					if (playerDoc.exists) {
						const playerData = playerDoc.data() as PlayerDocument | undefined

						if (playerData?.seasons) {
							const updatedSeasons = playerData.seasons.map(
								(season: PlayerSeason) =>
									season.team?.id === teamId
										? { ...season, team: null, captain: false }
										: season
							)

							transaction.update(member.player, { seasons: updatedSeasons })
							playerCount++
						}
					}
				}
			}

			// Delete all offers related to this team
			const offersQuery = await firestore
				.collection(Collections.OFFERS)
				.where('team', '==', teamRef)
				.get()

			for (const offerDoc of offersQuery.docs) {
				transaction.delete(offerDoc.ref)
				offerCount++
			}

			// Delete the team document
			transaction.delete(teamRef)

			return { playerCount, offerCount }
		})

		playersUpdated = result.playerCount
		offersDeleted = result.offerCount

		logger.info('Successfully deleted team with cleanup', {
			teamId,
			teamName,
			seasonId,
			playersUpdated,
			offersDeleted,
			logoDeleted,
		})

		return {
			teamId,
			teamName,
			success: true,
			playersUpdated,
			offersDeleted,
			logoDeleted,
		}
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error'

		logger.error('Error deleting team:', {
			teamId,
			teamName,
			error: errorMessage,
		})

		return {
			teamId,
			teamName,
			success: false,
			playersUpdated,
			offersDeleted,
			logoDeleted,
			error: errorMessage,
		}
	}
}

/**
 * Bulk delete unregistered teams for season lock
 *
 * Used when the 12th team registers to clean up all incomplete teams.
 * Continues processing even if individual deletions fail.
 *
 * @param firestore - Firestore instance
 * @param teamRefs - Array of team document references to delete
 * @param seasonId - The season ID for player updates
 */
export async function deleteUnregisteredTeamsForSeasonLock(
	firestore: FirebaseFirestore.Firestore,
	teamRefs: FirebaseFirestore.DocumentReference<TeamDocument>[],
	seasonId: string
): Promise<TeamDeletionResult[]> {
	const results: TeamDeletionResult[] = []

	for (const teamRef of teamRefs) {
		const result = await deleteTeamWithCleanup(firestore, teamRef, seasonId, {
			skipRegisteredCheck: true,
		})
		results.push(result)
	}

	return results
}

/**
 * Delete team logo from Storage
 *
 * @param storagePath - Path to the logo file in Storage
 * @returns Whether the deletion was successful
 */
async function deleteTeamLogo(storagePath: string): Promise<boolean> {
	try {
		const storage = getStorage()
		await storage.bucket().file(storagePath).delete()
		logger.info(`Deleted team logo: ${storagePath}`)
		return true
	} catch (error) {
		logger.warn('Failed to delete team logo (may not exist):', {
			storagePath,
			error: error instanceof Error ? error.message : 'Unknown error',
		})
		return false
	}
}
