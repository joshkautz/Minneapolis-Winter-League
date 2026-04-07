/**
 * Team season deletion service
 *
 * Deletes a team's participation in a specific season. The canonical team
 * parent document (`teams/{teamId}`) is left untouched even if this season
 * was its only participation — pruning a team across all of history is a
 * separate (and currently unimplemented) admin operation.
 *
 * Operations performed:
 *  1. Delete the team's roster subcollection for this season
 *  2. Clear `team` and `captain` from each affected player's season subdoc
 *  3. Delete the team's season subdoc
 *  4. Delete offers referencing (team, season)
 *  5. Delete the season-specific logo from Storage (best effort)
 */

import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { Collections } from '../types.js'
import {
	playerSeasonRef,
	teamRef as canonicalTeamRef,
	teamSeasonRef,
} from '../shared/database.js'

export interface TeamDeletionResult {
	teamId: string
	seasonId: string
	teamName: string
	success: boolean
	playersUpdated: number
	offersDeleted: number
	logoDeleted: boolean
	error?: string
}

interface DeleteOptions {
	/** Skip the "team is registered" guard. Used by the registration-lock cleanup. */
	skipRegisteredCheck?: boolean
}

/**
 * Delete a team's participation in a single season with full cleanup.
 */
export async function deleteTeamSeasonWithCleanup(
	firestore: FirebaseFirestore.Firestore,
	teamId: string,
	seasonId: string,
	options?: DeleteOptions
): Promise<TeamDeletionResult> {
	const teamSeasonDocRef = teamSeasonRef(firestore, teamId, seasonId)
	const teamCanonicalRef = canonicalTeamRef(firestore, teamId)

	let teamName = 'Unknown'
	let playersUpdated = 0
	let offersDeleted = 0
	let logoDeleted = false

	try {
		const teamSeasonSnap = await teamSeasonDocRef.get()
		if (!teamSeasonSnap.exists) {
			return {
				teamId,
				seasonId,
				teamName,
				success: false,
				playersUpdated: 0,
				offersDeleted: 0,
				logoDeleted: false,
				error: 'Team season not found',
			}
		}

		const teamSeasonData = teamSeasonSnap.data()
		teamName = teamSeasonData?.name ?? 'Unknown'

		if (!options?.skipRegisteredCheck && teamSeasonData?.registered) {
			return {
				teamId,
				seasonId,
				teamName,
				success: false,
				playersUpdated: 0,
				offersDeleted: 0,
				logoDeleted: false,
				error: 'Cannot delete a registered team',
			}
		}

		// 1. Read the roster (player IDs) before we delete it.
		const rosterSnap = await teamSeasonDocRef.collection('roster').get()
		const rosterPlayerIds = rosterSnap.docs.map((d) => d.id)

		// 2. Delete the season-specific logo (best effort, fire-and-forget).
		if (teamSeasonData?.storagePath) {
			logoDeleted = await deleteTeamLogo(teamSeasonData.storagePath)
		}

		// 3. Apply the cleanup writes in a transaction so the team season,
		// roster, and player season updates are atomic.
		await firestore.runTransaction(async (transaction) => {
			// Roster cleanup: delete each entry, clear the player's season subdoc.
			for (const playerId of rosterPlayerIds) {
				const rosterEntryRef = teamSeasonDocRef
					.collection('roster')
					.doc(playerId)
				transaction.delete(rosterEntryRef)
				const playerSeasonDocRef = playerSeasonRef(
					firestore,
					playerId,
					seasonId
				)
				const playerSeasonSnap = await transaction.get(playerSeasonDocRef)
				if (playerSeasonSnap.exists) {
					transaction.update(playerSeasonDocRef, {
						team: null,
						captain: false,
					})
					playersUpdated++
				}
			}

			// Delete the season subdoc itself.
			transaction.delete(teamSeasonDocRef)
		})

		// 4. Delete offers referencing this team + season. (Outside the
		// transaction because the query needs to run separately.)
		const offersQuery = await firestore
			.collection(Collections.OFFERS)
			.where('team', '==', teamCanonicalRef)
			.where('season', '==', teamSeasonData?.season)
			.get()

		if (!offersQuery.empty) {
			const batch = firestore.batch()
			for (const offerDoc of offersQuery.docs) {
				batch.delete(offerDoc.ref)
				offersDeleted++
			}
			await batch.commit()
		}

		logger.info('Successfully deleted team season with cleanup', {
			teamId,
			seasonId,
			teamName,
			playersUpdated,
			offersDeleted,
			logoDeleted,
		})

		return {
			teamId,
			seasonId,
			teamName,
			success: true,
			playersUpdated,
			offersDeleted,
			logoDeleted,
		}
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error'

		logger.error('Error deleting team season:', {
			teamId,
			seasonId,
			teamName,
			error: errorMessage,
		})

		return {
			teamId,
			seasonId,
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
 * Bulk-delete every unregistered team for a season. Used when the
 * registration lock threshold is hit.
 */
export async function deleteUnregisteredTeamsForSeasonLock(
	firestore: FirebaseFirestore.Firestore,
	teamSeasonPairs: Array<{ teamId: string; seasonId: string }>
): Promise<TeamDeletionResult[]> {
	const results: TeamDeletionResult[] = []
	for (const { teamId, seasonId } of teamSeasonPairs) {
		const result = await deleteTeamSeasonWithCleanup(
			firestore,
			teamId,
			seasonId,
			{
				skipRegisteredCheck: true,
			}
		)
		results.push(result)
	}
	return results
}

/**
 * Delete team logo from Storage. Best-effort — failures are logged and
 * swallowed because they should not block the rest of the cleanup.
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
