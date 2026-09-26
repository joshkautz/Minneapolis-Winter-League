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
 * Everything in Firestore — the player document and every season's state
 * and membership — is checked and written in one transaction, so a save is
 * applied whole or refused whole. Firebase Authentication cannot join it:
 * its likely refusals are checked before the transaction, and the email
 * change itself is made after, followed by the private contact email.
 */

import { getAuth } from 'firebase-admin/auth'
import {
	FieldValue,
	getFirestore,
	type Transaction,
} from 'firebase-admin/firestore'
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
	type PlayerSeasonDocument,
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
			const seasonIds = new Set<string>()
			for (const s of seasons) {
				if (!s.seasonId || typeof s.seasonId !== 'string') {
					throw new HttpsError(
						'invalid-argument',
						'Each season must have a valid seasonId'
					)
				}
				if (seasonIds.has(s.seasonId)) {
					throw new HttpsError(
						'invalid-argument',
						'Each season can be changed only once per save'
					)
				}
				seasonIds.add(s.seasonId)
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
			const contactDocRef = playerContactRef(firestore, playerId)

			// Firebase Authentication cannot join a Firestore transaction, so its
			// likely refusals are found before anything is written: a player
			// document can outlive its Auth account, and another account may
			// already use the new email. Either would otherwise surface after
			// the rest of the save had committed.
			const requestedEmail = email?.trim().toLowerCase()
			if (requestedEmail !== undefined || emailVerified !== undefined) {
				await requireAuthAccount(playerId)
			}
			if (requestedEmail !== undefined) {
				await refuseEmailOfAnotherAccount(requestedEmail, playerId)
			}

			// Every Firestore check and write happens in one transaction, so a
			// save is applied whole or refused whole. It used to write each
			// season on its own and the player document last, so a refusal on
			// the second season left the first one changed.
			const saved = await firestore.runTransaction(async (txn) => {
				const plan = await readPlayerUpdate(txn, {
					playerDocRef,
					contactDocRef,
					playerId,
					seasons: seasons ?? [],
					demotingAdmin: admin === false,
				})
				const { playerData, currentEmail } = plan

				const updates: Record<string, unknown> = {}
				const changes: UpdatePlayerAdminResponse['changes'] = {}

				if (
					normalizedFirstname !== undefined &&
					normalizedFirstname !== playerData.firstname
				) {
					updates.firstname = normalizedFirstname
					changes.firstname = {
						from: playerData.firstname || '',
						to: normalizedFirstname,
					}
				}
				if (
					normalizedLastname !== undefined &&
					normalizedLastname !== playerData.lastname
				) {
					updates.lastname = normalizedLastname
					changes.lastname = {
						from: playerData.lastname || '',
						to: normalizedLastname,
					}
				}
				if (admin !== undefined && admin !== playerData.admin) {
					// Last-admin protection, the counterpart to the last-captain
					// rule below. Losing every admin has no in-app recovery: admin
					// is a field on the player document rather than a token claim,
					// so it cannot be restored from the Firebase console's user
					// editor — only by editing Firestore directly.
					if (admin === false && !plan.anotherAdminRemains) {
						throw new HttpsError(
							'failed-precondition',
							'Cannot remove admin access from the only administrator. Grant admin to another player first.'
						)
					}
					updates.admin = admin
					changes.admin = { from: playerData.admin || false, to: admin }
				}

				// One flag on the player document. It used to live on each season
				// subdoc, which is what made a ban impossible to lift.
				if (banned !== undefined) {
					const currentBanned = playerData.banned === true
					if (banned !== currentBanned) {
						updates.banned = banned
						changes.banned = { from: currentBanned, to: banned }
					}
				}

				const seasonChanges: SeasonChanges[] = []
				const joinedSeasons: DocumentReference<SeasonDocument>[] = []
				for (const season of plan.seasons) {
					const { update, current, seasonRef, seasonName } = season
					const oldTeamId = current.team?.id || null
					const newTeamId = update.teamId
					const wasCaptain = current.captain === true

					// Last-captain protection: demoting a captain, or moving one
					// off their team, must leave that team another captain.
					const losesTheirCaptaincy =
						wasCaptain &&
						!!oldTeamId &&
						(oldTeamId !== newTeamId || !update.captain)
					if (losesTheirCaptaincy && !season.oldTeamHasAnotherCaptain) {
						throw new HttpsError(
							'failed-precondition',
							`Cannot remove captain status from ${playerData.firstname} ${playerData.lastname}. They are the only captain on this team for ${seasonName}. Please assign another captain first.`
						)
					}

					const tracked: NonNullable<SeasonChanges['changes']> = {}
					if (update.captain !== current.captain) {
						tracked.captain = { from: current.captain, to: update.captain }
					}
					if (update.paid !== current.paid) {
						tracked.paid = { from: current.paid, to: update.paid }
					}
					if (update.signed !== current.signed) {
						tracked.signed = { from: current.signed, to: update.signed }
					}
					if (oldTeamId !== newTeamId) {
						tracked.team = { from: oldTeamId, to: newTeamId }
					}

					// Membership. For a move, remove then add, so the player
					// season's `team` ends up on the new team — the second write
					// wins.
					if (oldTeamId !== newTeamId) {
						if (oldTeamId) {
							removePlayerFromTeam(txn, firestore, {
								playerId,
								teamId: oldTeamId,
								seasonId: update.seasonId,
							})
						}
						if (newTeamId) {
							addPlayerToTeam(txn, firestore, {
								playerId,
								teamId: newTeamId,
								seasonId: update.seasonId,
								seasonRef,
								captain: update.captain,
								existingPlayerSeason: current,
							})
							joinedSeasons.push(seasonRef)
						}
					} else if (wasCaptain !== update.captain) {
						setPlayerCaptainStatus(txn, firestore, {
							playerId,
							seasonId: update.seasonId,
							captain: update.captain,
						})
					}

					// Paid and signed are independent of membership.
					txn.update(playerSeasonRef(firestore, playerId, update.seasonId), {
						paid: update.paid,
						signed: update.signed,
					})

					// An admin marking someone signed — a paper waiver, a
					// correction — leaves the same kind of record a player's own
					// signature does, so every `signed: true` has one behind it.
					if (update.signed && current.signed !== true) {
						txn.create(
							playerDocRef.collection(WAIVER_SIGNATURES_SUBCOLLECTION).doc(),
							adminWaiverRecord({
								seasonId: update.seasonId,
								recordedBy: auth?.uid ?? '',
								participantName:
									`${playerData.firstname ?? ''} ${playerData.lastname ?? ''}`.trim(),
								email: requestedEmail ?? currentEmail ?? null,
							})
						)
					}

					if (Object.keys(tracked).length > 0) {
						seasonChanges.push({
							seasonId: update.seasonId,
							seasonName,
							updated: true,
							changes: tracked,
						})
					}
				}
				if (seasonChanges.length > 0) changes.seasons = seasonChanges

				if (Object.keys(updates).length > 0) {
					txn.update(playerDocRef, updates)
				}
				return { changes, currentEmail, joinedSeasons }
			})
			const { changes } = saved

			// ---- Firebase Authentication, after Firestore has committed ------
			// The private contact email follows Auth, written only once Auth has
			// taken the change, so the two never disagree.
			try {
				if (
					requestedEmail !== undefined &&
					saved.currentEmail?.toLowerCase() !== requestedEmail
				) {
					await authInstance.updateUser(playerId, {
						email: requestedEmail,
						emailVerified: true,
					})
					await contactDocRef.set({ email: requestedEmail })
					changes.email = {
						from: saved.currentEmail || '',
						to: requestedEmail,
					}
				}
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
			} catch (error) {
				logger.error('Saved the player but could not update their sign-in', {
					playerId,
					error: error instanceof Error ? error.message : 'Unknown error',
				})
				throw new HttpsError(
					'internal',
					'The player’s other changes were saved, but their sign-in email could not be updated. Please try again.'
				)
			}

			// Cancel pending offers for newly-added team memberships.
			for (const seasonRef of saved.joinedSeasons) {
				try {
					await cancelPendingOffersForPlayer(
						firestore,
						playerDocRef,
						seasonRef,
						'Player was added to a team by an administrator'
					)
				} catch (error) {
					logger.warn('Failed to cancel pending offers for player', {
						playerId,
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
				'The player’s changes could not be saved. Please try again.'
			)
		}
	}
)

/** Refuses, with a message saying why, a player with no sign-in account. */
async function requireAuthAccount(playerId: string): Promise<void> {
	try {
		await getAuth().getUser(playerId)
	} catch (error) {
		if (authErrorCode(error) === 'auth/user-not-found') {
			throw new HttpsError(
				'failed-precondition',
				'This player has no sign-in account, so their email and verification status cannot be changed. Their name, admin status and season details can still be edited.'
			)
		}
		throw error
	}
}

/** Refuses an email that already signs in to someone else's account. */
async function refuseEmailOfAnotherAccount(
	email: string,
	playerId: string
): Promise<void> {
	try {
		const holder = await getAuth().getUserByEmail(email)
		if (holder.uid !== playerId) {
			throw new HttpsError(
				'already-exists',
				'Another account already uses that email address.'
			)
		}
	} catch (error) {
		if (authErrorCode(error) === 'auth/user-not-found') return
		throw error
	}
}

const authErrorCode = (error: unknown): string =>
	error && typeof error === 'object' && 'code' in error
		? String((error as { code: unknown }).code)
		: ''

interface SeasonPlan {
	update: SeasonUpdate
	current: PlayerSeasonDocument
	seasonRef: DocumentReference<SeasonDocument>
	seasonName: string
	/** Only read when the player is a captain there; otherwise true. */
	oldTeamHasAnotherCaptain: boolean
}

/**
 * Every read the save depends on, made inside its transaction so each check
 * still holds when the writes commit. Refuses a missing player, a season the
 * player has no subdoc for, and a team not playing that season.
 */
async function readPlayerUpdate(
	txn: Transaction,
	params: {
		playerDocRef: DocumentReference<PlayerDocument>
		contactDocRef: DocumentReference
		playerId: string
		seasons: SeasonUpdate[]
		demotingAdmin: boolean
	}
): Promise<{
	playerData: PlayerDocument
	currentEmail: string | undefined
	anotherAdminRemains: boolean
	seasons: SeasonPlan[]
}> {
	const firestore = params.playerDocRef.firestore
	const { playerId } = params

	const [playerDoc, contactDoc] = await Promise.all([
		txn.get(params.playerDocRef),
		txn.get(params.contactDocRef),
	])
	const playerData = playerDoc.data()
	if (!playerDoc.exists || !playerData) {
		throw new HttpsError(
			'not-found',
			'Player not found. Please verify the Player ID is correct.'
		)
	}

	// Two is enough to answer the question: if the only match is the player
	// being demoted, there is no one else left.
	let anotherAdminRemains = true
	if (params.demotingAdmin) {
		const admins = await txn.get(
			firestore
				.collection(Collections.PLAYERS)
				.where('admin', '==', true)
				.limit(2)
		)
		anotherAdminRemains = admins.docs.some((doc) => doc.id !== playerId)
	}

	const seasons: SeasonPlan[] = []
	for (const update of params.seasons) {
		const seasonRef = firestore
			.collection(Collections.SEASONS)
			.doc(update.seasonId) as DocumentReference<SeasonDocument>
		const [playerSeasonSnap, seasonDoc] = await Promise.all([
			txn.get(playerSeasonRef(firestore, playerId, update.seasonId)),
			txn.get(seasonRef),
		])
		const current = playerSeasonSnap.data()
		if (!current) {
			throw new HttpsError(
				'invalid-argument',
				`Cannot add new seasons through this function. Season ${update.seasonId} does not exist on the player. Use the season management functions to seed it first.`
			)
		}
		if (!seasonDoc.exists) {
			throw new HttpsError('not-found', `Season ${update.seasonId} not found`)
		}
		if (update.teamId) {
			const target = await txn.get(
				teamSeasonRef(firestore, update.teamId, update.seasonId)
			)
			if (!target.exists) {
				throw new HttpsError(
					'invalid-argument',
					`Team ${update.teamId} does not participate in season ${update.seasonId}`
				)
			}
		}

		let oldTeamHasAnotherCaptain = true
		const oldTeamId = current.team?.id
		if (current.captain === true && oldTeamId) {
			const roster = await txn.get(
				teamSeasonRef(firestore, oldTeamId, update.seasonId).collection(
					'roster'
				)
			)
			const teammates = await Promise.all(
				roster.docs
					.filter((doc) => doc.id !== playerId)
					.map((doc) =>
						txn.get(playerSeasonRef(firestore, doc.id, update.seasonId))
					)
			)
			oldTeamHasAnotherCaptain = teammates.some(
				(snap) => snap.data()?.captain === true
			)
		}

		seasons.push({
			update,
			current,
			seasonRef,
			seasonName: seasonDoc.data()?.name || update.seasonId,
			oldTeamHasAnotherCaptain,
		})
	}

	return {
		playerData,
		currentEmail: contactDoc.data()?.email,
		anotherAdminRemains,
		seasons,
	}
}

/** The waiver record left when an admin marks a player signed. */
function adminWaiverRecord(params: {
	seasonId: string
	recordedBy: string
	participantName: string
	email: string | null
}): Omit<WaiverSignatureDocument, 'signedAt'> & { signedAt: FieldValue } {
	const version = currentWaiverVersion()
	return {
		seasonId: params.seasonId,
		versionId: version.id,
		versionSha256: waiverFingerprint(version),
		method: 'admin',
		recordedBy: params.recordedBy,
		signedAt: FieldValue.serverTimestamp(),
		participantName: params.participantName,
		signerName: null,
		signerRole: null,
		guardianRelationship: null,
		dateOfBirth: null,
		mailingAddress: null,
		emergencyContacts: [],
		email: params.email,
		ipAddress: null,
		userAgent: null,
		note: 'Marked signed by an admin in Player Management.',
	}
}
