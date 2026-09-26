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

import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { parseImageUpload, storeImage } from '../../../shared/images.js'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
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
import { assertRegistrationOpen } from '../../../shared/registrationWindow.js'

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

		// Checked before any reads, so a bad logo is refused straight away.
		const logo = parseImageUpload(logoBlob, logoContentType, 'The logo')

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
				await validateNotBanned(firestore, userId)
			}

			if (!isAdmin) {
				assertRegistrationOpen(
					seasonData,
					'Team registration has closed.',
					timezone
				)
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

			// Store the logo before writing anything, so a failed upload refuses
			// the whole request rather than creating a team without its logo.
			const teamId = crypto.randomUUID()
			const storedLogo = logo
				? await storeImage(`teams/${crypto.randomUUID()}`, logo, 'The logo')
				: null

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
					createdAt: FieldValue.serverTimestamp(),
					createdBy: playerDocRef,
				})
				txn.set(teamSeasonDocRef, {
					season: seasonDocRef,
					name: name.trim(),
					logo: storedLogo?.url ?? null,
					storagePath: storedLogo?.storagePath ?? null,
					registered: false,
					registeredDate: null,
					placement: null,
				})
				txn.set(rosterEntryDocRef, {
					player: playerDocRef,
					dateJoined: FieldValue.serverTimestamp(),
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
			// Re-throw HttpsErrors so the code this function chose — not-found,
			// failed-precondition, already-exists — reaches the client. Without
			// this, every deliberate rejection arrived as `internal` and the UI
			// could not tell "registration has closed" from a server fault.
			if (error instanceof HttpsError) {
				throw error
			}

			logger.error('Error creating team:', {
				userId,
				teamName: name,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new HttpsError(
				'internal',
				'Your team could not be created. Please try again.'
			)
		}
	}
)
