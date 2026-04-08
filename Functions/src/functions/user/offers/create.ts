/**
 * Create offer callable function
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - Target player must not be banned for the current season
 * - Registration must not have ended
 * - For invitations: user must be a team captain
 * - For requests: user must be the player making the request
 * - Player must not already be on a team for this season
 * - Admins bypass banned and registration date restrictions
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	OfferStatus,
	OfferType,
	SeasonDocument,
} from '../../../types.js'
import { validateAuthentication } from '../../../shared/auth.js'
import {
	getCurrentSeason,
	getCurrentSeasonRef,
	playerSeasonRef,
	teamSeasonRef,
} from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { formatDateForUser } from '../../../shared/format.js'

interface CreateOfferRequest {
	playerId: string
	teamId: string
	type: OfferType
	timezone?: string
}

export const createOffer = onCall<CreateOfferRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		// Validate authentication
		try {
			validateAuthentication(request.auth)
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Authentication failed'
			throw new HttpsError('unauthenticated', errorMessage)
		}

		const { playerId, teamId, type, timezone } = request.data
		const userId = request.auth?.uid ?? ''

		if (!playerId || !teamId || !type) {
			throw new HttpsError(
				'invalid-argument',
				'Player ID, team ID, and type are required'
			)
		}

		const allowedOfferTypes: OfferType[] = [
			OfferType.INVITATION,
			OfferType.REQUEST,
		]
		if (!allowedOfferTypes.includes(type)) {
			throw new HttpsError(
				'invalid-argument',
				'Invalid offer type. Must be invitation or request'
			)
		}

		try {
			const firestore = getFirestore()

			// Get current season info first (outside transaction)
			const currentSeason = await getCurrentSeason()
			if (!currentSeason) {
				throw new HttpsError('failed-precondition', 'No current season found')
			}
			const seasonRef = await getCurrentSeasonRef()

			// Setup references
			const playerRef = firestore.collection(Collections.PLAYERS).doc(playerId)
			const teamRef = firestore.collection(Collections.TEAMS).doc(teamId)

			// Use deterministic document ID to prevent race conditions
			// This allows atomic check-and-create using transaction.get()
			const pendingOfferId = `${playerId}_${teamId}_${seasonRef.id}_pending`
			const pendingOfferRef = firestore
				.collection(Collections.OFFERS)
				.doc(pendingOfferId)

			return await firestore.runTransaction(async (transaction) => {
				// Atomically check if pending offer already exists
				// This prevents race conditions where two concurrent requests
				// could both pass the check before either creates the offer
				const existingOfferDoc = await transaction.get(pendingOfferRef)

				if (existingOfferDoc.exists) {
					const existingData = existingOfferDoc.data()
					if (existingData?.status === OfferStatus.PENDING) {
						throw new HttpsError(
							'already-exists',
							'A pending offer already exists between this player and team'
						)
					}
				}
				// Read all the inputs we need: player parent doc, team season subdoc,
				// season doc, target player season subdoc (banned + team check),
				// caller player parent doc (admin), caller player season subdoc
				// (captain check for invitations).
				const [
					playerDoc,
					seasonDoc,
					teamSeasonSnap,
					targetPlayerSeasonSnap,
					currentUserDoc,
					currentUserSeasonSnap,
				] = await Promise.all([
					transaction.get(playerRef),
					transaction.get(seasonRef),
					transaction.get(teamSeasonRef(firestore, teamId, seasonRef.id)),
					transaction.get(playerSeasonRef(firestore, playerId, seasonRef.id)),
					transaction.get(
						firestore.collection(Collections.PLAYERS).doc(userId)
					),
					transaction.get(playerSeasonRef(firestore, userId, seasonRef.id)),
				])

				if (!playerDoc.exists) {
					throw new HttpsError('not-found', 'Player not found')
				}
				if (!teamSeasonSnap.exists) {
					throw new HttpsError(
						'not-found',
						'Team is not participating in the current season'
					)
				}
				if (!seasonDoc.exists) {
					throw new HttpsError('not-found', 'Season not found')
				}

				const seasonData = seasonDoc.data() as SeasonDocument | undefined
				if (!seasonData) {
					throw new HttpsError('internal', 'Unable to retrieve season data')
				}

				const isAdmin = currentUserDoc.data()?.admin === true

				// Validate target player is not banned for this season (skip for admins).
				if (!isAdmin) {
					const targetSeasonData = targetPlayerSeasonSnap.data()
					if (targetSeasonData?.banned === true) {
						throw new HttpsError(
							'permission-denied',
							'Target player is banned from this season'
						)
					}
				}

				// Validate that registration has not ended (skip for admins).
				if (!isAdmin) {
					const now = new Date()
					const registrationEnd = seasonData.registrationEnd.toDate()
					if (now > registrationEnd) {
						throw new HttpsError(
							'failed-precondition',
							`Team roster changes are not allowed after registration has closed. Registration ended ${formatDateForUser(registrationEnd, timezone)}.`
						)
					}
				}

				// Validate authorization based on offer type.
				if (type === OfferType.INVITATION) {
					// User must be a captain of the team for the current season.
					const callerSeasonData = currentUserSeasonSnap.data()
					const userIsCaptain =
						callerSeasonData?.team?.id === teamId &&
						callerSeasonData?.captain === true
					if (!userIsCaptain) {
						throw new HttpsError(
							'permission-denied',
							'Only team captains can send invitations'
						)
					}
				} else if (type === OfferType.REQUEST) {
					if (userId !== playerId) {
						throw new HttpsError(
							'permission-denied',
							'You can only create requests for yourself'
						)
					}
				}

				// Check if player is already on a team for current season.
				const targetSeasonData = targetPlayerSeasonSnap.data()
				if (targetSeasonData?.team) {
					throw new HttpsError(
						'already-exists',
						'Player is already on a team for this season'
					)
				}

				// Create offer document using deterministic ID for atomic operation
				const offerData = {
					player: playerRef,
					team: teamRef,
					season: seasonRef,
					type,
					status: OfferStatus.PENDING,
					createdBy: firestore.collection(Collections.PLAYERS).doc(userId),
					createdAt: new Date(),
				}

				// Use transaction.set() with the deterministic document ID
				// This ensures the check and create are atomic
				transaction.set(pendingOfferRef, offerData)

				logger.info(`Successfully created offer: ${pendingOfferId}`, {
					type,
					playerId,
					teamId,
					createdBy: userId,
				})

				return {
					success: true,
					offerId: pendingOfferId,
					message: `${type === OfferType.INVITATION ? 'Invitation' : 'Request'} created successfully`,
				}
			})
		} catch (error) {
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error creating offer:', {
				playerId,
				teamId,
				type,
				userId,
				error: errorMessage,
			})

			throw new HttpsError('internal', errorMessage)
		}
	}
)
