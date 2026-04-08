/**
 * Create team callable function
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must not be banned for the target season
 * - Registration must not have ended
 * - User must not already be on a team for this season
 * - Admins bypass banned and registration date restrictions
 *
 * Note: When creating a new player season subdoc, banned status is preserved
 * from the most recent previous season to maintain ban continuity.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { getPublicFileUrl } from '../../../shared/storage.js'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	PLAYER_SEASONS_SUBCOLLECTION,
	PlayerDocument,
	SeasonDocument,
	DocumentReference,
} from '../../../types.js'
import { cancelPendingOffersForPlayer } from '../../../shared/offers.js'
import {
	validateAuthentication,
	validateNotBanned,
} from '../../../shared/auth.js'
import {
	playerSeasonRef,
	teamRef as canonicalTeamRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { formatDateForUser } from '../../../shared/format.js'

interface CreateTeamRequest {
	name: string
	logoBlob?: string // Base64 encoded image
	logoContentType?: string // MIME type of the image
	seasonId: string
	timezone?: string // User's browser timezone (e.g., 'America/New_York')
}

export const createTeam = onCall<CreateTeamRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { auth, data } = request

		validateAuthentication(auth)

		const { name, logoBlob, logoContentType, seasonId, timezone } = data
		const userId = auth.uid

		if (!name || !seasonId) {
			throw new HttpsError(
				'invalid-argument',
				'Team name and season ID are required'
			)
		}

		if (logoBlob && !logoContentType) {
			throw new HttpsError(
				'invalid-argument',
				'Logo content type is required when uploading logo'
			)
		}

		if (logoContentType && !logoContentType.startsWith('image/')) {
			throw new HttpsError(
				'invalid-argument',
				'Only image files are allowed for logos'
			)
		}

		try {
			const firestore = getFirestore()

			// Validate season exists and registration is open.
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
			const now = new Date()

			// Load player canonical doc.
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
				await validateNotBanned(firestore, userId, seasonId)
			}

			if (!isAdmin) {
				const registrationEnd = seasonData.registrationEnd.toDate()
				if (now > registrationEnd) {
					throw new HttpsError(
						'failed-precondition',
						`Team registration has closed. Registration ended ${formatDateForUser(registrationEnd, timezone)}.`
					)
				}
			}

			// Check whether the player already has a team for this season by
			// reading their season subdoc.
			const playerSeasonDocRef = playerSeasonRef(firestore, userId, seasonId)
			const existingPlayerSeasonSnap = await playerSeasonDocRef.get()
			const existingPlayerSeasonData = existingPlayerSeasonSnap.exists
				? existingPlayerSeasonSnap.data()
				: undefined

			if (existingPlayerSeasonData?.team) {
				throw new HttpsError(
					'already-exists',
					'Player is already on a team for this season'
				)
			}

			// Generate canonical team id and upload logo (if any).
			const teamId = crypto.randomUUID()
			const fileId = crypto.randomUUID()
			let logoUrl = ''
			let storagePath = ''

			if (logoBlob && logoContentType) {
				try {
					const storage = getStorage()
					const bucket = storage.bucket()
					const fileName = `teams/${fileId}`
					const file = bucket.file(fileName)

					const buffer = Buffer.from(logoBlob, 'base64')
					await file.save(buffer, {
						metadata: { contentType: logoContentType },
					})
					await file.makePublic()

					logoUrl = getPublicFileUrl(bucket.name, fileName)
					storagePath = fileName

					logger.info(`Successfully uploaded logo for team: ${teamId}`, {
						fileName,
						contentType: logoContentType,
					})
				} catch (uploadError) {
					logger.error('Logo upload failed:', uploadError)
					logoUrl = ''
					storagePath = ''
				}
			}

			// Determine banned status to seed onto the player's new season subdoc
			// if it doesn't already exist. Preserves ban continuity by reading the
			// player's most recently-created season subdoc.
			let bannedStatus = false
			if (!existingPlayerSeasonData) {
				const otherSeasons = await playerDocRef
					.collection(PLAYER_SEASONS_SUBCOLLECTION)
					.orderBy('season')
					.get()
				const lastBanned = otherSeasons.docs.find(
					(d) => d.id !== seasonId && d.data()?.banned === true
				)
				bannedStatus = !!lastBanned
			}

			// Atomically: create canonical team parent + season subdoc + roster
			// entry, and create or update the player's season subdoc.
			const teamCanonicalRef = canonicalTeamRef(firestore, teamId)
			const teamSeasonDocRef = teamSeasonRef(firestore, teamId, seasonId)
			const rosterEntryDocRef = teamRosterEntryRef(
				firestore,
				teamId,
				seasonId,
				userId
			)

			await firestore.runTransaction(async (txn) => {
				txn.set(teamCanonicalRef, {
					createdAt: Timestamp.now(),
					createdBy: playerDocRef,
				})
				txn.set(teamSeasonDocRef, {
					season: seasonDocRef,
					name: name.trim(),
					logo: logoUrl || null,
					storagePath: storagePath || null,
					registered: false,
					registeredDate: null,
					placement: null,
				})
				txn.set(rosterEntryDocRef, {
					player: playerDocRef,
					dateJoined: Timestamp.now(),
				})

				if (existingPlayerSeasonData) {
					txn.update(playerSeasonDocRef, {
						team: teamCanonicalRef,
						captain: true,
					})
				} else {
					txn.set(playerSeasonDocRef, {
						season: seasonDocRef,
						team: teamCanonicalRef,
						paid: false,
						signed: false,
						banned: bannedStatus,
						captain: true,
					})
				}
			})

			// Cancel any pending offers for this player in this season since they
			// are now on a team. Outside the transaction because the query needs
			// to run separately.
			const canceledOffersCount = await cancelPendingOffersForPlayer(
				firestore,
				playerDocRef,
				seasonDocRef,
				'Player created a new team'
			)

			logger.info(`Successfully created team: ${teamId}`, {
				teamName: name,
				captainId: userId,
				seasonId,
				canceledPendingOffers: canceledOffersCount,
			})

			return {
				success: true,
				teamId,
				message: 'Team created successfully',
			}
		} catch (error) {
			logger.error('Error creating team:', {
				userId,
				teamName: name,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new HttpsError(
				'internal',
				error instanceof Error ? error.message : 'Failed to create team'
			)
		}
	}
)
