/**
 * Update player (admin) callable function
 *
 * Allows admins to update any player's document, including:
 * - Basic information (firstname, lastname)
 * - Admin status
 * - Email address (syncs with Firebase Authentication)
 * - Email verification status
 * - League-wide ban (account-level, not per season)
 * - Per-season state (paid, signed, captain, team)
 *
 * Two invariants are enforced here and nowhere else: the league always has at
 * least one admin, and a team with a roster always has at least one captain.
 *
 * Per-season state writes go to `players/{uid}/playerSeasons/{seasonId}` subdocs
 * directly, one update per changed field. Team change writes the new roster
 * entry, deletes the old one, and updates the player season's `team` and
 * `captain` fields atomically.
 */

import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { validateAdminUser } from '../../../shared/auth.js'
import { validateAndNormalizeName } from '../../../shared/names.js'
import { cancelPendingOffersForPlayer } from '../../../shared/offers.js'
import {
	playerContactRef,
	playerSeasonRef,
	teamSeasonRef,
} from '../../../shared/database.js'
import {
	addPlayerToTeam,
	removePlayerFromTeam,
	setPlayerCaptainStatus,
} from '../../../shared/membership.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import {
	Collections,
	WAIVER_SIGNATURES_SUBCOLLECTION,
	type DocumentReference,
	type PlayerDocument,
	type SeasonDocument,
	type WaiverSignatureDocument,
} from '../../../types.js'
import { currentWaiverVersion } from '../../../waiver/versions.js'
import { waiverFingerprint } from '../../../waiver/fingerprint.js'

interface SeasonUpdate {
	seasonId: string
	captain: boolean
	paid: boolean
	signed: boolean
	teamId: string | null
}

interface UpdatePlayerAdminRequest {
	playerId: string
	firstname?: string
	lastname?: string
	admin?: boolean
	email?: string
	emailVerified?: boolean
	/**
	 * League-wide ban. Applies to the person, not a season — see the field
	 * doc on PlayerDocument. While the backfill is outstanding this is also
	 * mirrored onto every one of the player's season subdocs, so the fallback
	 * read in `isPlayerBanned` agrees with it.
	 */
	banned?: boolean
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
		banned?: { from: boolean; to: boolean }
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
			banned,
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
			banned === undefined &&
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
		// Same rules the App's nameSchema applies, enforced here because an
		// admin editing a name goes through this callable.
		// The profanity check is skipped for admin edits: the blocklist cannot
		// know every surname, so an organizer typing a name deliberately is
		// the override for a real person it wrongly refuses. Length, character
		// set and normalization still apply.
		const normalizedFirstname =
			firstname !== undefined
				? validateAndNormalizeName(firstname, 'First name', {
						checkProfanity: false,
					})
				: undefined
		const normalizedLastname =
			lastname !== undefined
				? validateAndNormalizeName(lastname, 'Last name', {
						checkProfanity: false,
					})
				: undefined
		if (admin !== undefined && typeof admin !== 'boolean') {
			throw new HttpsError(
				'invalid-argument',
				'Admin status must be a boolean value'
			)
		}
		if (banned !== undefined && typeof banned !== 'boolean') {
			throw new HttpsError(
				'invalid-argument',
				'Banned status must be a boolean value'
			)
		}
		if (emailVerified !== undefined && typeof emailVerified !== 'boolean') {
			throw new HttpsError(
				'invalid-argument',
				'Email verified status must be a boolean value'
			)
		}
		if (seasons !== undefined) {
			if (!Array.isArray(seasons)) {
				throw new HttpsError('invalid-argument', 'Seasons must be an array')
			}
			for (const s of seasons) {
				if (!s.seasonId || typeof s.seasonId !== 'string') {
					throw new HttpsError(
						'invalid-argument',
						'Each season must have a valid seasonId'
					)
				}
				if (typeof s.captain !== 'boolean') {
					throw new HttpsError(
						'invalid-argument',
						'Captain status must be a boolean value'
					)
				}
				if (typeof s.paid !== 'boolean') {
					throw new HttpsError(
						'invalid-argument',
						'Paid status must be a boolean value'
					)
				}
				if (typeof s.signed !== 'boolean') {
					throw new HttpsError(
						'invalid-argument',
						'Signed status must be a boolean value'
					)
				}
				if (
					s.teamId !== null &&
					(typeof s.teamId !== 'string' || !s.teamId.trim())
				) {
					throw new HttpsError(
						'invalid-argument',
						'Team ID must be a string or null'
					)
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
			const contactDocRef = playerContactRef(firestore, playerId)
			const currentEmail = (await contactDocRef.get()).data()?.email

			// Both of the fields below write to Firebase Authentication, and a
			// player document can outlive its Auth account. Check once, up
			// front, so a missing account is a clear message rather than an
			// opaque 500 raised halfway through — every other change in the
			// same save (name, admin, season state) would be abandoned with
			// it, leaving the admin unable to edit the player at all.
			if (email !== undefined || emailVerified !== undefined) {
				try {
					await authInstance.getUser(playerId)
				} catch (error) {
					const code =
						error && typeof error === 'object' && 'code' in error
							? (error as { code: string }).code
							: ''
					if (code === 'auth/user-not-found') {
						throw new HttpsError(
							'failed-precondition',
							'This player has no sign-in account, so their email and verification status cannot be changed. Their name, admin status and season details can still be edited.'
						)
					}
					throw error
				}
			}

			const updates: Record<string, unknown> = {}
			// Set when the email changes; it lives in playerContacts, not on
			// the public player document.
			let newContactEmail: string | undefined
			const changes: UpdatePlayerAdminResponse['changes'] = {}

			if (
				normalizedFirstname !== undefined &&
				normalizedFirstname !== playerData?.firstname
			) {
				updates.firstname = normalizedFirstname
				changes.firstname = {
					from: playerData?.firstname || '',
					to: normalizedFirstname,
				}
			}
			if (
				normalizedLastname !== undefined &&
				normalizedLastname !== playerData?.lastname
			) {
				updates.lastname = normalizedLastname
				changes.lastname = {
					from: playerData?.lastname || '',
					to: normalizedLastname,
				}
			}
			if (admin !== undefined && admin !== playerData?.admin) {
				// Last-admin protection, the counterpart to the last-captain rule
				// further down. Losing every admin has no in-app recovery: admin
				// is a field on the player document rather than a token claim, so
				// it cannot be restored from the Firebase console's user editor —
				// only by editing Firestore directly.
				if (admin === false) {
					// Two is enough to answer the question: if the only match is
					// the player being demoted, there is no one else left.
					const adminsSnapshot = await firestore
						.collection(Collections.PLAYERS)
						.where('admin', '==', true)
						.limit(2)
						.get()
					const anotherAdminRemains = adminsSnapshot.docs.some(
						(doc) => doc.id !== playerId
					)
					if (!anotherAdminRemains) {
						throw new HttpsError(
							'failed-precondition',
							'Cannot remove admin access from the only administrator. Grant admin to another player first.'
						)
					}
				}

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
					newContactEmail = trimmedNewEmail
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

			// ---- League-wide ban ---------------------------------------------
			// One flag on the player document. It used to live on each season
			// subdoc, which is what made a ban impossible to lift.
			if (banned !== undefined) {
				const currentBanned = playerData?.banned === true
				if (banned !== currentBanned) {
					updates.banned = banned
					changes.banned = { from: currentBanned, to: banned }
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
						wasCaptain &&
						!willBeCaptain &&
						oldTeamId === newTeamId &&
						!!newTeamId
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
							return (
								rosterSnap.docs[i].id !== playerId && s.data()?.captain === true
							)
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
					if (oldTeamId !== newTeamId) {
						trackedChanges.team = { from: oldTeamId, to: newTeamId }
					}

					// We need the canonical season ref for addPlayerToTeam (when
					// creating a new player season subdoc — this branch never hits
					// because the validation above asserts the subdoc already exists,
					// but the helper requires the ref regardless).
					const seasonCanonicalRef = firestore
						.collection(Collections.SEASONS)
						.doc(seasonUpdate.seasonId) as DocumentReference<SeasonDocument>

					await firestore.runTransaction((txn) => {
						// 1. Membership change (if any). Order matters: we run remove
						// then add for moves so the player season subdoc's `team` field
						// ends up pointing at the new team — the second write wins.
						if (oldTeamId !== newTeamId) {
							if (oldTeamId) {
								removePlayerFromTeam(txn, firestore, {
									playerId,
									teamId: oldTeamId,
									seasonId: seasonUpdate.seasonId,
								})
							}
							if (newTeamId) {
								addPlayerToTeam(txn, firestore, {
									playerId,
									teamId: newTeamId,
									seasonId: seasonUpdate.seasonId,
									seasonRef: seasonCanonicalRef,
									captain: seasonUpdate.captain,
									existingPlayerSeason: currentPlayerSeason,
								})
							}
						} else if (wasCaptain !== willBeCaptain) {
							// No team change, just captain status flip.
							setPlayerCaptainStatus(txn, firestore, {
								playerId,
								seasonId: seasonUpdate.seasonId,
								captain: seasonUpdate.captain,
							})
						}

						// 2. Field-only updates (paid / signed). These are
						// independent of membership and always written. Captain is
						// already handled above so we deliberately omit it here.
						txn.update(playerSeasonDocRef, {
							paid: seasonUpdate.paid,
							signed: seasonUpdate.signed,
						})

						// 3. An admin marking someone signed — a paper waiver, a
						// correction — leaves the same kind of record a player's own
						// signature does, so every `signed: true` has one behind it.
						if (seasonUpdate.signed && currentPlayerSeason.signed !== true) {
							const version = currentWaiverVersion()
							const record: Omit<WaiverSignatureDocument, 'signedAt'> & {
								signedAt: FieldValue
							} = {
								seasonId: seasonUpdate.seasonId,
								versionId: version.id,
								versionSha256: waiverFingerprint(version),
								method: 'admin',
								recordedBy: auth?.uid ?? '',
								signedAt: FieldValue.serverTimestamp(),
								participantName:
									`${playerData?.firstname ?? ''} ${playerData?.lastname ?? ''}`.trim(),
								signerName: null,
								signerRole: null,
								guardianRelationship: null,
								dateOfBirth: null,
								mailingAddress: null,
								emergencyContacts: [],
								email: newContactEmail ?? currentEmail ?? null,
								ipAddress: null,
								userAgent: null,
								note: 'Marked signed by an admin in Player Management.',
							}
							txn.create(
								playerDocRef.collection(WAIVER_SIGNATURES_SUBCOLLECTION).doc(),
								record
							)
						}
						return Promise.resolve()
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
			if (newContactEmail !== undefined) {
				await contactDocRef.set({ email: newContactEmail })
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
