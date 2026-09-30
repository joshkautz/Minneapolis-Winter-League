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
import { deleteInBatches } from '../shared/batches.js'
import {
	Collections,
	TEAM_SEASONS_SUBCOLLECTION,
	type TeamContributionDocument,
} from '../types.js'
import {
	playerSeasonRef,
	teamRef as canonicalTeamRef,
	teamSeasonRef,
} from '../shared/database.js'
import {
	CONTRIBUTIONS_SUBCOLLECTION,
	holdsMoney,
} from '../shared/contributions.js'

export interface TeamDeletionResult {
	teamId: string
	seasonId: string
	teamName: string
	success: boolean
	playersUpdated: number
	offersDeleted: number
	logoDeleted: boolean
	/**
	 * Why it failed. A refusal (`not-found`, `failed-precondition`) carries a
	 * message fit to show the caller; `internal` carries the raw error for the
	 * logs only.
	 */
	errorCode?: 'not-found' | 'failed-precondition' | 'internal'
	error?: string
}

/** Logos written by createTeam and updateTeam; nothing outside it is a logo. */
const TEAM_LOGO_PREFIX = 'teams/'

/** A deletion the team's state does not allow, found inside the transaction. */
class DeletionRefused extends Error {
	constructor(
		readonly code: 'not-found' | 'failed-precondition',
		message: string
	) {
		super(message)
		this.name = 'DeletionRefused'
	}
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
		// Every check and write happens in one transaction: checked outside
		// it, a payment recorded between the check and the delete was left
		// charged under a team-season that no longer existed, where nothing
		// would ever refund it.
		const teamSeasonData = await firestore.runTransaction(
			async (transaction) => {
				// A retried transaction starts its count again.
				playersUpdated = 0
				// Firestore requires every read in a transaction to happen
				// before any write. Reading each player's season subdoc after
				// deleting a roster entry once failed every team deletion.
				const [teamSeasonSnap, contributionsSnap, rosterSnap] =
					await Promise.all([
						transaction.get(teamSeasonDocRef),
						transaction.get(
							teamSeasonDocRef.collection(CONTRIBUTIONS_SUBCOLLECTION)
						),
						transaction.get(teamSeasonDocRef.collection('roster')),
					])
				if (!teamSeasonSnap.exists) {
					throw new DeletionRefused(
						'not-found',
						'This team is no longer in that season. Reload the page.'
					)
				}
				const data = teamSeasonSnap.data()
				teamName = data?.name ?? 'Unknown'

				if (!options?.skipRegisteredCheck && data?.registered) {
					throw new DeletionRefused(
						'failed-precondition',
						'A registered team cannot be deleted.'
					)
				}

				// Money must be settled before anything is deleted. Every route
				// that removes a team-season is a route to losing track of a
				// contribution, and three of the four go through here — so the
				// invariant lives here rather than at each call site.
				if (
					holdsMoney(
						contributionsSnap.docs.map(
							(doc) => doc.data() as TeamContributionDocument
						)
					)
				) {
					throw new DeletionRefused(
						'failed-precondition',
						'Cannot delete a team that still holds money. ' +
							'Refund its contributions first.'
					)
				}

				const rosterPlayerIds = rosterSnap.docs.map((d) => d.id)
				const playerSeasonDocRefs = rosterPlayerIds.map((playerId) =>
					playerSeasonRef(firestore, playerId, seasonId)
				)
				const playerSeasonSnaps = await Promise.all(
					playerSeasonDocRefs.map((ref) => transaction.get(ref))
				)

				// Every write, after every read.
				rosterPlayerIds.forEach((playerId, index) => {
					transaction.delete(
						teamSeasonDocRef.collection('roster').doc(playerId)
					)
					if (playerSeasonSnaps[index].exists) {
						transaction.update(playerSeasonDocRefs[index], {
							team: null,
							captain: false,
						})
						playersUpdated++
					}
				})
				transaction.delete(teamSeasonDocRef)
				return data
			}
		)

		// 3. Delete the logo, once the season is gone. Before it, a failed
		// transaction would leave a team whose logo no longer exists.
		if (teamSeasonData?.storagePath) {
			logoDeleted = await deleteUnsharedTeamLogo(
				teamCanonicalRef,
				teamSeasonData.storagePath
			)
		}

		// 4. Delete offers referencing this team + season. (Outside the
		// transaction because the query needs to run separately.)
		const offersQuery = await firestore
			.collection(Collections.OFFERS)
			.where('team', '==', teamCanonicalRef)
			.where('season', '==', teamSeasonData?.season)
			.get()

		// In batches: a team's offers grow with the season.
		offersDeleted = await deleteInBatches(
			firestore,
			offersQuery.docs.map((doc) => doc.ref)
		)

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
		if (error instanceof DeletionRefused) {
			return {
				teamId,
				seasonId,
				teamName,
				success: false,
				playersUpdated: 0,
				offersDeleted: 0,
				logoDeleted: false,
				errorCode: error.code,
				error: error.message,
			}
		}
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
			errorCode: 'internal',
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
 * Delete a deleted team-season's logo from Storage, unless it is still in
 * use. A rollover copies the previous season's logo, file and all, so the
 * team's other seasons may show the same file; and only files under
 * `teams/` are logos, whatever the document says. Best effort — failures
 * are logged, because they should not block the rest of the cleanup.
 */
async function deleteUnsharedTeamLogo(
	teamCanonicalRef: FirebaseFirestore.DocumentReference,
	storagePath: string
): Promise<boolean> {
	if (!storagePath.startsWith(TEAM_LOGO_PREFIX)) {
		logger.warn('Not deleting a team logo outside teams/', { storagePath })
		return false
	}
	try {
		const otherSeasons = await teamCanonicalRef
			.collection(TEAM_SEASONS_SUBCOLLECTION)
			.where('storagePath', '==', storagePath)
			.limit(1)
			.get()
		if (!otherSeasons.empty) {
			logger.info('Keeping a team logo another season still shows', {
				storagePath,
			})
			return false
		}

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
