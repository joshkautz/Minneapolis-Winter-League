/**
 * Merge two teams callable function (Admin only)
 *
 * Merges a "losing" team into a "winning" team. After the operation:
 *   - Every `teams/{losingId}/teamSeasons/{sid}` subdoc is moved under
 *     `teams/{winningId}/teamSeasons/{sid}` (roster subcollection included).
 *   - Every badge from the losing team is moved to the winning team,
 *     deduping by `badgeId` and keeping the earlier `awardedAt`.
 *   - Every `games.home|away` and `offers.team` reference to the losing
 *     team is rewritten to point at the winning team.
 *   - Every `players/{uid}/playerSeasons/{sid}.team` pointing at the losing
 *     team is rewritten through the centralized membership helpers so the
 *     roster dual-write stays consistent.
 *   - `teams/{losingId}` is recursively deleted.
 *   - The winning team's `createdAt` / `createdBy` are back-filled from the
 *     losing team if the losing team's values are earlier / the winner's
 *     are null.
 *
 * Refuses the merge (failed-precondition) if either team is missing, the
 * two ids match, or any season has a `teamSeasons` subdoc on BOTH teams
 * (the admin must manually resolve season collisions first).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { validateAdminUser } from '../../../shared/auth.js'
import { isMigrationInProgress } from '../../../shared/maintenance.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import {
	playerSeasonRef,
	teamBadgeRef,
	teamRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../../shared/database.js'
import {
	addPlayerToTeam,
	removePlayerFromTeam,
} from '../../../shared/membership.js'
import {
	Collections,
	PLAYER_SEASONS_SUBCOLLECTION,
	TEAM_SEASONS_SUBCOLLECTION,
	type DocumentReference,
	type GameDocument,
	type OfferDocument,
	type PlayerSeasonDocument,
	type SeasonDocument,
	type TeamBadgeDocument,
	type TeamSeasonDocument,
} from '../../../types.js'

interface MergeTeamsRequest {
	/** Canonical id of the team to keep */
	winningTeamId: string
	/** Canonical id of the team to merge in and delete */
	losingTeamId: string
}

interface MergeTeamsResponse {
	success: boolean
	message: string
	winningTeamId: string
	losingTeamId: string
	movedTeamSeasons: number
	movedBadges: number
	badgesDeduped: number
	rewrittenGames: number
	rewrittenOffers: number
	rewrittenPlayerSeasons: number
}

const BATCH_LIMIT = 400

export const mergeTeams = onCall<MergeTeamsRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request): Promise<MergeTeamsResponse> => {
		try {
			const { auth: authContext, data } = request
			const firestore = getFirestore()

			await validateAdminUser(authContext, firestore)

			if (await isMigrationInProgress(firestore)) {
				throw new HttpsError(
					'failed-precondition',
					'A data migration is in progress. Merging teams is disabled until it completes.'
				)
			}

			const { winningTeamId, losingTeamId } = data
			if (!winningTeamId || !losingTeamId) {
				throw new HttpsError(
					'invalid-argument',
					'Both winningTeamId and losingTeamId are required'
				)
			}
			if (winningTeamId === losingTeamId) {
				throw new HttpsError(
					'invalid-argument',
					'Cannot merge a team into itself'
				)
			}

			const winningTeamRef = teamRef(firestore, winningTeamId)
			const losingTeamRef = teamRef(firestore, losingTeamId)

			// ---- Validation: both teams exist ------------------------------
			const [winningTeamSnap, losingTeamSnap] = await Promise.all([
				winningTeamRef.get(),
				losingTeamRef.get(),
			])
			if (!winningTeamSnap.exists) {
				throw new HttpsError(
					'not-found',
					`Winning team ${winningTeamId} does not exist`
				)
			}
			if (!losingTeamSnap.exists) {
				throw new HttpsError(
					'not-found',
					`Losing team ${losingTeamId} does not exist`
				)
			}

			// ---- Load both teams' teamSeasons (and winner's season id set) --
			const [losingTeamSeasonsSnap, winningTeamSeasonsSnap] = await Promise.all(
				[
					losingTeamRef.collection(TEAM_SEASONS_SUBCOLLECTION).get() as Promise<
						FirebaseFirestore.QuerySnapshot<TeamSeasonDocument>
					>,
					winningTeamRef
						.collection(TEAM_SEASONS_SUBCOLLECTION)
						.get() as Promise<
						FirebaseFirestore.QuerySnapshot<TeamSeasonDocument>
					>,
				]
			)

			const winningSeasonIds = new Set(
				winningTeamSeasonsSnap.docs.map((d) => d.id)
			)
			const collidingSeasonIds: string[] = []
			for (const doc of losingTeamSeasonsSnap.docs) {
				if (winningSeasonIds.has(doc.id)) {
					collidingSeasonIds.push(doc.id)
				}
			}
			if (collidingSeasonIds.length > 0) {
				throw new HttpsError(
					'failed-precondition',
					`Cannot merge: both teams have a season record for season id(s) [${collidingSeasonIds.join(
						', '
					)}]. Delete one of the conflicting team-season records first.`
				)
			}

			logger.info('Admin merging teams', {
				winningTeamId,
				losingTeamId,
				adminUserId: authContext?.uid,
				losingTeamSeasons: losingTeamSeasonsSnap.size,
			})

			// ---- Pre-load losing team's rosters (per season) ----------------
			const rosterByLosingSeasonId = new Map<
				string,
				FirebaseFirestore.QueryDocumentSnapshot[]
			>()
			for (const teamSeasonDoc of losingTeamSeasonsSnap.docs) {
				const rosterSnap = await teamSeasonDoc.ref.collection('roster').get()
				rosterByLosingSeasonId.set(teamSeasonDoc.id, rosterSnap.docs)
			}

			// ---- Pre-load badges from both teams ----------------------------
			const [losingBadgesSnap, winningBadgesSnap] = await Promise.all([
				losingTeamRef.collection('badges').get() as Promise<
					FirebaseFirestore.QuerySnapshot<TeamBadgeDocument>
				>,
				winningTeamRef.collection('badges').get() as Promise<
					FirebaseFirestore.QuerySnapshot<TeamBadgeDocument>
				>,
			])
			const winningBadgesByBadgeId = new Map<string, TeamBadgeDocument>()
			for (const b of winningBadgesSnap.docs) {
				winningBadgesByBadgeId.set(b.id, b.data())
			}

			// ---- Pre-load games referencing losing team ---------------------
			const [gamesHomeSnap, gamesAwaySnap] = await Promise.all([
				firestore
					.collection(Collections.GAMES)
					.where('home', '==', losingTeamRef)
					.get() as Promise<FirebaseFirestore.QuerySnapshot<GameDocument>>,
				firestore
					.collection(Collections.GAMES)
					.where('away', '==', losingTeamRef)
					.get() as Promise<FirebaseFirestore.QuerySnapshot<GameDocument>>,
			])

			// ---- Pre-load offers referencing losing team --------------------
			const offersSnap = (await firestore
				.collection(Collections.OFFERS)
				.where('team', '==', losingTeamRef)
				.get()) as FirebaseFirestore.QuerySnapshot<OfferDocument>

			// ---- Pre-load player-seasons pointing at losing team ------------
			const playerSeasonsSnap = (await firestore
				.collectionGroup(PLAYER_SEASONS_SUBCOLLECTION)
				.where('team', '==', losingTeamRef)
				.get()) as FirebaseFirestore.QuerySnapshot<PlayerSeasonDocument>

			// ================================================================
			// WRITES
			// ================================================================

			// 6a + 6b: Copy each team-season subdoc + its roster entries to B.
			let movedTeamSeasons = 0
			for (const teamSeasonDoc of losingTeamSeasonsSnap.docs) {
				const seasonId = teamSeasonDoc.id
				const destTeamSeasonRef = teamSeasonRef(
					firestore,
					winningTeamId,
					seasonId
				)

				const batch = firestore.batch()
				batch.set(destTeamSeasonRef, teamSeasonDoc.data())

				const rosterDocs = rosterByLosingSeasonId.get(seasonId) ?? []
				for (const rosterDoc of rosterDocs) {
					const rosterData = rosterDoc.data()
					const destRosterRef = teamRosterEntryRef(
						firestore,
						winningTeamId,
						seasonId,
						rosterDoc.id
					)
					batch.set(destRosterRef, {
						player: rosterData.player,
						dateJoined: rosterData.dateJoined,
					})
				}
				await batch.commit()
				movedTeamSeasons++
			}

			// 6c: Move / dedup badges.
			let movedBadges = 0
			let badgesDeduped = 0
			if (losingBadgesSnap.size > 0) {
				let batch = firestore.batch()
				let ops = 0
				for (const badgeDoc of losingBadgesSnap.docs) {
					const badgeId = badgeDoc.id
					const losingData = badgeDoc.data()
					const existingOnWinner = winningBadgesByBadgeId.get(badgeId)

					if (existingOnWinner) {
						const existingAt =
							existingOnWinner.awardedAt?.toMillis?.() ?? Infinity
						const losingAt = losingData.awardedAt?.toMillis?.() ?? Infinity
						if (losingAt < existingAt) {
							// Losing team's copy is earlier — keep losing team's copy.
							batch.set(
								teamBadgeRef(firestore, winningTeamId, badgeId),
								losingData
							)
							ops++
						}
						badgesDeduped++
					} else {
						batch.set(
							teamBadgeRef(firestore, winningTeamId, badgeId),
							losingData
						)
						ops++
						movedBadges++
					}
					if (ops >= BATCH_LIMIT) {
						await batch.commit()
						batch = firestore.batch()
						ops = 0
					}
				}
				if (ops > 0) await batch.commit()
			}

			// 6d: Rewrite games.
			let rewrittenGames = 0
			{
				const allGameDocs = [...gamesHomeSnap.docs, ...gamesAwaySnap.docs]
				let batch = firestore.batch()
				let ops = 0
				for (const gameDoc of allGameDocs) {
					const gameData = gameDoc.data()
					const update: { home?: DocumentReference; away?: DocumentReference } =
						{}
					if (gameData.home && gameData.home.id === losingTeamId) {
						update.home = winningTeamRef
					}
					if (gameData.away && gameData.away.id === losingTeamId) {
						update.away = winningTeamRef
					}
					if (Object.keys(update).length === 0) continue
					batch.update(gameDoc.ref, update)
					ops++
					rewrittenGames++
					if (ops >= BATCH_LIMIT) {
						await batch.commit()
						batch = firestore.batch()
						ops = 0
					}
				}
				if (ops > 0) await batch.commit()
			}

			// 6e: Rewrite offers.
			let rewrittenOffers = 0
			{
				let batch = firestore.batch()
				let ops = 0
				for (const offerDoc of offersSnap.docs) {
					batch.update(offerDoc.ref, { team: winningTeamRef })
					ops++
					rewrittenOffers++
					if (ops >= BATCH_LIMIT) {
						await batch.commit()
						batch = firestore.batch()
						ops = 0
					}
				}
				if (ops > 0) await batch.commit()
			}

			// 6f: Rewrite player-season.team via centralized membership helpers.
			// For each player pointing at A for season S, run a transaction that
			// removes them from A and adds them to B, preserving captain status.
			let rewrittenPlayerSeasons = 0
			for (const psDoc of playerSeasonsSnap.docs) {
				const playerParent = psDoc.ref.parent.parent
				if (!playerParent) continue
				const playerId = playerParent.id
				const seasonId = psDoc.id
				const psData = psDoc.data()
				const seasonRef = psData.season as DocumentReference<SeasonDocument>
				const captain = psData.captain === true

				await firestore.runTransaction(async (txn) => {
					// Re-read the player-season doc inside the transaction so the
					// addPlayerToTeam helper gets an up-to-date snapshot.
					const freshSnap = await txn.get(
						playerSeasonRef(firestore, playerId, seasonId)
					)
					const freshData = freshSnap.exists ? (freshSnap.data() ?? null) : null

					removePlayerFromTeam(txn, firestore, {
						playerId,
						teamId: losingTeamId,
						seasonId,
					})
					addPlayerToTeam(txn, firestore, {
						playerId,
						teamId: winningTeamId,
						seasonId,
						seasonRef,
						captain,
						// After removePlayerFromTeam's update, the doc still exists
						// (removePlayerFromTeam updates rather than deletes), so pass
						// the fresh data to take the "update" branch.
						existingPlayerSeason: freshData,
					})
				})
				rewrittenPlayerSeasons++
			}

			// 6g: Back-fill winner's createdAt / createdBy from loser if earlier.
			const winningData = winningTeamSnap.data()
			const losingData = losingTeamSnap.data()
			const winnerUpdate: Record<string, unknown> = {}
			if (losingData?.createdAt && winningData?.createdAt) {
				const losingMs = losingData.createdAt.toMillis?.() ?? Infinity
				const winningMs = winningData.createdAt.toMillis?.() ?? Infinity
				if (losingMs < winningMs) {
					winnerUpdate.createdAt = losingData.createdAt
				}
			} else if (losingData?.createdAt && !winningData?.createdAt) {
				winnerUpdate.createdAt = losingData.createdAt
			}
			if (losingData?.createdBy && !winningData?.createdBy) {
				winnerUpdate.createdBy = losingData.createdBy
			}
			if (Object.keys(winnerUpdate).length > 0) {
				await winningTeamRef.update(winnerUpdate)
			}

			// 6h: Recursive-delete the losing team.
			await firestore.recursiveDelete(losingTeamRef)

			logger.info('Successfully merged teams', {
				winningTeamId,
				losingTeamId,
				movedTeamSeasons,
				movedBadges,
				badgesDeduped,
				rewrittenGames,
				rewrittenOffers,
				rewrittenPlayerSeasons,
			})

			return {
				success: true,
				message: `Merged team ${losingTeamId} into ${winningTeamId}`,
				winningTeamId,
				losingTeamId,
				movedTeamSeasons,
				movedBadges,
				badgesDeduped,
				rewrittenGames,
				rewrittenOffers,
				rewrittenPlayerSeasons,
			}
		} catch (error) {
			if (error instanceof HttpsError) throw error
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'
			logger.error('Error merging teams:', {
				winningTeamId: request.data?.winningTeamId,
				losingTeamId: request.data?.losingTeamId,
				adminUserId: request.auth?.uid,
				error: errorMessage,
			})
			throw new HttpsError('internal', errorMessage)
		}
	}
)
