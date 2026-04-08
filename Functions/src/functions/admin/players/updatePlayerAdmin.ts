/**
 * Update player (admin) callable function
 *
 * Allows admins to update any player's document, including:
 * - Basic information (firstname, lastname)
 * - Admin status
 * - Email address (syncs with Firebase Authentication)
 * - Email verification status
 * - Per-season state (paid, signed, banned, captain, team)
 *
 * Per-season state writes go to `players/{uid}/seasons/{seasonId}` subdocs
 * directly, one update per changed field. Team change writes the new roster
 * entry, deletes the old one, and updates the player season's `team` and
 * `captain` fields atomically.
 */

import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { validateAdminUser } from '../../../shared/auth.js'
import { cancelPendingOffersForPlayer } from '../../../shared/offers.js'
import {
	playerSeasonRef,
	teamRef as canonicalTeamRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import {
	Collections,
	type DocumentReference,
	type PlayerDocument,
	type PlayerSeasonDocument,
	type SeasonDocument,
} from '../../../types.js'

interface SeasonUpdate {
	seasonId: string
	captain: boolean
	paid: boolean
	signed: boolean
	banned?: boolean
	teamId: string | null
}

interface UpdatePlayerAdminRequest {
	playerId: string
	firstname?: string
	lastname?: string
	admin?: boolean
	email?: string
	emailVerified?: boolean
	seasons?: SeasonUpdate[]
}

interface SeasonChanges {
	seasonId: string
	seasonName?: string
	updated?: boolean
	changes?: {
		captain?: { from: boolean; to: boolean }
		paid?: { from: boolean; to: boolean }
		signed?: { from: boolean; to: boolean }
		banned?: { from: boolean; to: boolean }
		team?: { from: string | null; to: string | null }
	}
}

interface UpdatePlayerAdminResponse {
	success: true
	playerId: string
	message: string
	changes: {
		firstname?: { from: string; to: string }
		lastname?: { from: string; to: string }
		email?: { from: string; to: string }
		admin?: { from: boolean; to: boolean }
		emailVerified?: { from: boolean; to: boolean }
		seasons?: SeasonChanges[]
	}
}

export const updatePlayerAdmin = onCall<
	UpdatePlayerAdminRequest,
	Promise<UpdatePlayerAdminResponse>
>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<UpdatePlayerAdminResponse> => {
		const { auth, data } = request

		logger.info('updatePlayerAdmin called', {
			adminUserId: auth?.uid,
			targetPlayerId: data.playerId,
			hasEmailUpdate: !!data.email,
			hasEmailVerifiedUpdate: data.emailVerified !== undefined,
			hasSeasonsUpdate: !!data.seasons,
		})

		const firestore = getFirestore()
		await validateAdminUser(auth, firestore)

		const {
			playerId,
			firstname,
			lastname,
			admin,
			email,
			emailVerified,
			seasons,
		} = data

		if (!playerId || typeof playerId !== 'string') {
			throw new HttpsError('invalid-argument', 'Player ID is required')
		}

		if (
			firstname === undefined &&
			lastname === undefined &&
			admin === undefined &&
			email === undefined &&
			emailVerified === undefined &&
			!seasons
		) {
			throw new HttpsError(
				'invalid-argument',
				'At least one field must be provided for update'
			)
		}

		// ---- Field validation ------------------------------------------------
		if (email !== undefined) {
			if (typeof email !== 'string' || !email.trim()) {
				throw new HttpsError(
					'invalid-argument',
					'Email must be a non-empty string'
				)
			}
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
			if (!emailRegex.test(email.trim())) {
				throw new HttpsError(
					'invalid-argument',
					'Invalid email format. Please provide a valid email address.'
				)
			}
		}
		if (firstname !== undefined && (typeof firstname !== 'string' || !firstname.trim())) {
			throw new HttpsError('invalid-argument', 'First name must be a non-empty string')
		}
		if (lastname !== undefined && (typeof lastname !== 'string' || !lastname.trim())) {
			throw new HttpsError('invalid-argument', 'Last name must be a non-empty string')
		}
		if (admin !== undefined && typeof admin !== 'boolean') {
			throw new HttpsError('invalid-argument', 'Admin status must be a boolean value')
		}
		if (emailVerified !== undefined && typeof emailVerified !== 'boolean') {
			throw new HttpsError('invalid-argument', 'Email verified status must be a boolean value')
		}
		if (seasons !== undefined) {
			if (!Array.isArray(seasons)) {
				throw new HttpsError('invalid-argument', 'Seasons must be an array')
			}
			for (const s of seasons) {
				if (!s.seasonId || typeof s.seasonId !== 'string') {
					throw new HttpsError('invalid-argument', 'Each season must have a valid seasonId')
				}
				if (typeof s.captain !== 'boolean') {
					throw new HttpsError('invalid-argument', 'Captain status must be a boolean value')
				}
				if (typeof s.paid !== 'boolean') {
					throw new HttpsError('invalid-argument', 'Paid status must be a boolean value')
				}
				if (typeof s.signed !== 'boolean') {
					throw new HttpsError('invalid-argument', 'Signed status must be a boolean value')
				}
				if (s.banned !== undefined && typeof s.banned !== 'boolean') {
					throw new HttpsError('invalid-argument', 'Banned status must be a boolean value')
				}
				if (
					s.teamId !== null &&
					(typeof s.teamId !== 'string' || !s.teamId.trim())
				) {
					throw new HttpsError('invalid-argument', 'Team ID must be a string or null')
				}
			}
		}

		try {
			const authInstance = getAuth()
			const playerDocRef = firestore
				.collection(Collections.PLAYERS)
				.doc(playerId) as DocumentReference<PlayerDocument>

			const playerDoc = await playerDocRef.get()
			if (!playerDoc.exists) {
				throw new HttpsError(
					'not-found',
					'Player not found. Please verify the Player ID is correct.'
				)
			}
			const playerData = playerDoc.data()
			const currentEmail = playerData?.email

			const updates: Record<string, unknown> = {}
			const changes: UpdatePlayerAdminResponse['changes'] = {}

			if (firstname !== undefined && firstname.trim() !== playerData?.firstname) {
				updates.firstname = firstname.trim()
				changes.firstname = { from: playerData?.firstname || '', to: firstname.trim() }
			}
			if (lastname !== undefined && lastname.trim() !== playerData?.lastname) {
				updates.lastname = lastname.trim()
				changes.lastname = { from: playerData?.lastname || '', to: lastname.trim() }
			}
			if (admin !== undefined && admin !== playerData?.admin) {
				updates.admin = admin
				changes.admin = { from: playerData?.admin || false, to: admin }
			}

			// ---- Email update -------------------------------------------------
			if (email !== undefined) {
				const trimmedNewEmail = email.trim().toLowerCase()
				if (currentEmail?.toLowerCase() !== trimmedNewEmail) {
					await authInstance.updateUser(playerId, {
						email: trimmedNewEmail,
						emailVerified: true,
					})
					updates.email = trimmedNewEmail
					changes.email = { from: currentEmail || '', to: trimmedNewEmail }
				}
			}

			// ---- emailVerified update ----------------------------------------
			if (emailVerified !== undefined) {
				const currentUser = await authInstance.getUser(playerId)
				if (emailVerified !== currentUser.emailVerified) {
					await authInstance.updateUser(playerId, { emailVerified })
					changes.emailVerified = {
						from: currentUser.emailVerified,
						to: emailVerified,
					}
				}
			}

			// ---- Seasons updates ---------------------------------------------
			const seasonChanges: SeasonChanges[] = []
			const playersAddedToTeam: Array<{
				playerRef: DocumentReference<PlayerDocument>
				seasonRef: DocumentReference<SeasonDocument>
			}> = []

			if (seasons && seasons.length > 0) {
				// Pre-load season names + validate that the player has each season
				// subdoc + each target team has a season subdoc.
				const seasonNames = new Map<string, string>()
				for (const seasonUpdate of seasons) {
					// Player must have an existing season subdoc.
					const playerSeasonDocRef = playerSeasonRef(
						firestore,
						playerId,
						seasonUpdate.seasonId
					)
					const playerSeasonSnap = await playerSeasonDocRef.get()
					if (!playerSeasonSnap.exists) {
						throw new HttpsError(
							'invalid-argument',
							`Cannot add new seasons through this function. Season ${seasonUpdate.seasonId} does not exist on the player. Use the season management functions to seed it first.`
						)
					}

					const seasonDoc = await firestore
						.collection(Collections.SEASONS)
						.doc(seasonUpdate.seasonId)
						.get()
					if (!seasonDoc.exists) {
						throw new HttpsError(
							'not-found',
							`Season ${seasonUpdate.seasonId} not found`
						)
					}
					const seasonData = seasonDoc.data()
					if (seasonData?.name) {
						seasonNames.set(seasonUpdate.seasonId, seasonData.name)
					}

					if (seasonUpdate.teamId) {
						const targetTeamSeasonSnap = await teamSeasonRef(
							firestore,
							seasonUpdate.teamId,
							seasonUpdate.seasonId
						).get()
						if (!targetTeamSeasonSnap.exists) {
							throw new HttpsError(
								'invalid-argument',
								`Team ${seasonUpdate.teamId} does not participate in season ${seasonUpdate.seasonId}`
							)
						}
					}
				}

				// Apply each season update.
				for (const seasonUpdate of seasons) {
					const playerSeasonDocRef = playerSeasonRef(
						firestore,
						playerId,
						seasonUpdate.seasonId
					)
					const currentPlayerSeasonSnap = await playerSeasonDocRef.get()
					const currentPlayerSeason = currentPlayerSeasonSnap.data()
					if (!currentPlayerSeason) continue

					const oldTeamId = currentPlayerSeason.team?.id || null
					const newTeamId = seasonUpdate.teamId
					const wasCaptain = currentPlayerSeason.captain === true
					const willBeCaptain = seasonUpdate.captain === true

					// Last-captain protection.
					const isDemotingCaptain =
						wasCaptain && !willBeCaptain && oldTeamId === newTeamId && !!newTeamId
					const isRemovingCaptainFromTeam =
						wasCaptain && oldTeamId && oldTeamId !== newTeamId

					if (isDemotingCaptain || isRemovingCaptainFromTeam) {
						const teamIdToCheck = oldTeamId as string
						const rosterSnap = await teamSeasonRef(
							firestore,
							teamIdToCheck,
							seasonUpdate.seasonId
						)
							.collection('roster')
							.get()
						const captainSnaps = await Promise.all(
							rosterSnap.docs.map((d) =>
								playerSeasonRef(firestore, d.id, seasonUpdate.seasonId).get()
							)
						)
						const otherCaptainCount = captainSnaps.filter((s, i) => {
							return rosterSnap.docs[i].id !== playerId && s.data()?.captain === true
						}).length
						if (otherCaptainCount === 0) {
							const seasonName =
								seasonNames.get(seasonUpdate.seasonId) || seasonUpdate.seasonId
							throw new HttpsError(
								'failed-precondition',
								`Cannot remove captain status from ${playerData?.firstname} ${playerData?.lastname}. They are the only captain on this team for ${seasonName}. Please assign another captain first.`
							)
						}
					}

					// Build per-field change tracking.
					const trackedChanges: NonNullable<SeasonChanges['changes']> = {}
					if (seasonUpdate.captain !== currentPlayerSeason.captain) {
						trackedChanges.captain = {
							from: currentPlayerSeason.captain,
							to: seasonUpdate.captain,
						}
					}
					if (seasonUpdate.paid !== currentPlayerSeason.paid) {
						trackedChanges.paid = {
							from: currentPlayerSeason.paid,
							to: seasonUpdate.paid,
						}
					}
					if (seasonUpdate.signed !== currentPlayerSeason.signed) {
						trackedChanges.signed = {
							from: currentPlayerSeason.signed,
							to: seasonUpdate.signed,
						}
					}
					const oldBanned = currentPlayerSeason.banned ?? false
					const newBanned = seasonUpdate.banned ?? oldBanned
					if (newBanned !== oldBanned) {
						trackedChanges.banned = { from: oldBanned, to: newBanned }
					}
					if (oldTeamId !== newTeamId) {
						trackedChanges.team = { from: oldTeamId, to: newTeamId }
					}

					// Apply player season subdoc update + team membership writes.
					const playerSeasonUpdate: Partial<PlayerSeasonDocument> = {
						captain: seasonUpdate.captain,
						paid: seasonUpdate.paid,
						signed: seasonUpdate.signed,
						banned: newBanned,
					}
					if (oldTeamId !== newTeamId) {
						playerSeasonUpdate.team = newTeamId
							? canonicalTeamRef(firestore, newTeamId)
							: null
					}

					await firestore.runTransaction(async (txn) => {
						txn.update(playerSeasonDocRef, playerSeasonUpdate)

						if (oldTeamId !== newTeamId) {
							if (oldTeamId) {
								txn.delete(
									teamRosterEntryRef(
										firestore,
										oldTeamId,
										seasonUpdate.seasonId,
										playerId
									)
								)
							}
							if (newTeamId) {
								txn.set(
									teamRosterEntryRef(
										firestore,
										newTeamId,
										seasonUpdate.seasonId,
										playerId
									),
									{
										player: playerDocRef,
										dateJoined: Timestamp.now(),
									}
								)
							}
						}
					})

					if (Object.keys(trackedChanges).length > 0) {
						seasonChanges.push({
							seasonId: seasonUpdate.seasonId,
							seasonName: seasonNames.get(seasonUpdate.seasonId),
							updated: true,
							changes: trackedChanges,
						})
					}

					if (newTeamId && oldTeamId !== newTeamId) {
						const seasonRefForOffers = firestore
							.collection(Collections.SEASONS)
							.doc(seasonUpdate.seasonId) as DocumentReference<SeasonDocument>
						playersAddedToTeam.push({
							playerRef: playerDocRef,
							seasonRef: seasonRefForOffers,
						})
					}
				}

				if (seasonChanges.length > 0) {
					changes.seasons = seasonChanges
				}
			}

			// Apply player parent doc updates if any.
			if (Object.keys(updates).length > 0) {
				await playerDocRef.update(updates)
			}

			// Cancel pending offers for newly-added team memberships.
			for (const { playerRef: pRef, seasonRef: sRef } of playersAddedToTeam) {
				try {
					await cancelPendingOffersForPlayer(
						firestore,
						pRef,
						sRef,
						'Player was added to a team by an administrator'
					)
				} catch (error) {
					logger.warn('Failed to cancel pending offers for player', {
						playerId: pRef.id,
						error: error instanceof Error ? error.message : 'Unknown error',
					})
				}
			}

			logger.info('Player update completed successfully', {
				playerId,
				updatedBy: auth?.uid,
				changes: Object.keys(changes),
			})

			return {
				success: true,
				playerId,
				message: 'Player successfully updated',
				changes,
			}
		} catch (error) {
			logger.error('Error updating player', {
				playerId,
				adminUserId: auth?.uid,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			if (error instanceof HttpsError) throw error
			throw new HttpsError(
				'internal',
				error instanceof Error ? error.message : 'Failed to update player'
			)
		}
	}
)
