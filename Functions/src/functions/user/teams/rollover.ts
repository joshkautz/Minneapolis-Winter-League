/**
 * Rollover team callable function
 *
 * Joins an existing canonical team to a new season. Under the new data model
 * this is a single subdocument creation, not a doc clone.
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must not be banned
 * - Registration must not have ended
 * - User must have been a captain of the canonical team in any prior season
 * - User must not already be on a team for this season
 * - The team must not already have a season subdoc for this season
 * - Admins bypass banned and registration date restrictions
 */

import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	DocumentReference,
	PlayerDocument,
	SeasonDocument,
	TEAM_SEASONS_SUBCOLLECTION,
} from '../../../types.js'
import { cancelPendingOffersForPlayer } from '../../../shared/offers.js'
import {
	validateAuthentication,
	validateNotBanned,
} from '../../../shared/auth.js'
import {
	playerSeasonRef,
	teamRef as canonicalTeamRef,
	teamSeasonRef,
} from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { assertRegistrationOpen } from '../../../shared/registrationWindow.js'
import { addPlayerToTeam } from '../../../shared/membership.js'

interface RolloverTeamRequest {
	originalTeamId: string
	seasonId: string
	timezone?: string
}

export const rolloverTeam = onCall<RolloverTeamRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { auth, data } = request
		validateAuthentication(auth)

		const { originalTeamId, seasonId, timezone } = data
		const userId = auth.uid

		if (!originalTeamId || !seasonId) {
			throw new HttpsError(
				'invalid-argument',
				'Original team ID and season ID are required'
			)
		}

		try {
			const firestore = getFirestore()

			const seasonDocRef = firestore
				.collection(Collections.SEASONS)
				.doc(seasonId) as DocumentReference<SeasonDocument>
			const seasonDoc = await seasonDocRef.get()
			if (!seasonDoc.exists) {
				throw new HttpsError('not-found', 'Invalid season ID')
			}
			const seasonData = seasonDoc.data()
			if (!seasonData) {
				throw new HttpsError('internal', 'Unable to retrieve season data')
			}

			const playerDocRef = firestore
				.collection(Collections.PLAYERS)
				.doc(userId) as DocumentReference<PlayerDocument>
			const playerDoc = await playerDocRef.get()
			if (!playerDoc.exists) {
				throw new HttpsError('not-found', 'Player profile not found')
			}
			const playerDocument = playerDoc.data()
			if (!playerDocument) {
				throw new HttpsError('internal', 'Unable to retrieve player data')
			}

			const isAdmin = playerDocument.admin === true

			if (!isAdmin) {
				await validateNotBanned(firestore, userId)

				assertRegistrationOpen(
					seasonData,
					'Team registration has closed.',
					timezone
				)
			}

			// Verify the canonical team exists.
			const teamCanonicalDocRef = canonicalTeamRef(firestore, originalTeamId)
			const teamCanonicalSnap = await teamCanonicalDocRef.get()
			if (!teamCanonicalSnap.exists) {
				throw new HttpsError('not-found', 'Original team not found')
			}

			// Verify the user has been a captain of this team in any previous season.
			// Walk the team's `seasons` subcollection and check each roster entry.
			const previousSeasonsSnap = await teamCanonicalDocRef
				.collection(TEAM_SEASONS_SUBCOLLECTION)
				.get()
			let userWasCaptain = false
			let mostRecentSeasonName: string | null = null
			let mostRecentSeasonLogo: string | null = null
			let mostRecentSeasonStoragePath: string | null = null
			let mostRecentSeasonStartMs = 0
			for (const seasonSubdoc of previousSeasonsSnap.docs) {
				const seasonSubdocData = seasonSubdoc.data()
				const otherSeasonRef = seasonSubdocData?.season
				if (otherSeasonRef) {
					const otherSeasonSnap = await otherSeasonRef.get()
					const otherSeasonStartMs =
						otherSeasonSnap.data()?.dateStart?.toMillis?.() ?? 0
					if (otherSeasonStartMs >= mostRecentSeasonStartMs) {
						mostRecentSeasonStartMs = otherSeasonStartMs
						mostRecentSeasonName = seasonSubdocData?.name ?? null
						mostRecentSeasonLogo = seasonSubdocData?.logo ?? null
						mostRecentSeasonStoragePath = seasonSubdocData?.storagePath ?? null
					}
				}

				if (!userWasCaptain) {
					const playerSeasonForOther = await playerSeasonRef(
						firestore,
						userId,
						seasonSubdoc.id
					).get()
					if (
						playerSeasonForOther.exists &&
						playerSeasonForOther.data()?.captain === true &&
						playerSeasonForOther.data()?.team?.id === originalTeamId
					) {
						userWasCaptain = true
					}
				}
			}

			if (!userWasCaptain) {
				throw new HttpsError(
					'permission-denied',
					'Only captains of the original team can rollover the team'
				)
			}

			const playerSeasonDocRef = playerSeasonRef(firestore, userId, seasonId)
			const teamSeasonDocRef = teamSeasonRef(
				firestore,
				originalTeamId,
				seasonId
			)

			await firestore.runTransaction(async (txn) => {
				// Checked in the transaction, where they hold: two requests at
				// once — a double tap, two tabs — would otherwise both pass, and
				// the player would captain two teams or the season be written twice.
				const playerSeasonSnap = await txn.get(playerSeasonDocRef)
				if (playerSeasonSnap.data()?.team) {
					throw new HttpsError(
						'already-exists',
						'Player is already on a team for this season'
					)
				}
				if ((await txn.get(teamSeasonDocRef)).exists) {
					throw new HttpsError(
						'already-exists',
						'Team has already been rolled over for this season'
					)
				}

				txn.set(teamSeasonDocRef, {
					season: seasonDocRef,
					name: mostRecentSeasonName ?? '',
					logo: mostRecentSeasonLogo,
					storagePath: mostRecentSeasonStoragePath,
					registered: false,
					registeredDate: null,
					placement: null,
				})
				addPlayerToTeam(txn, firestore, {
					playerId: userId,
					teamId: originalTeamId,
					seasonId,
					seasonRef: seasonDocRef,
					captain: true,
					existingPlayerSeason: playerSeasonSnap.data() ?? null,
				})
			})

			const canceledOffersCount = await cancelPendingOffersForPlayer(
				firestore,
				playerDocRef,
				seasonDocRef,
				'Player rolled over a team from a previous season'
			)

			logger.info(`Successfully rolled over team: ${originalTeamId}`, {
				originalTeamId,
				teamName: mostRecentSeasonName,
				captainId: userId,
				seasonId,
				canceledPendingOffers: canceledOffersCount,
			})

			return {
				success: true,
				teamId: originalTeamId,
				message: 'Team rolled over successfully',
			}
		} catch (error) {
			// Re-throw HttpsErrors so the code this function chose — not-found,
			// failed-precondition, already-exists — reaches the client. Without
			// this, every deliberate rejection arrived as `internal` and the UI
			// could not tell "registration has closed" from a server fault.
			if (error instanceof HttpsError) {
				throw error
			}

			logger.error('Error rolling over team:', {
				userId,
				originalTeamId,
				seasonId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw new HttpsError(
				'internal',
				'Your team could not be rolled over. Please try again.'
			)
		}
	}
)
