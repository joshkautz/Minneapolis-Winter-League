/**
 * Create offer callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	PlayerDocument,
	TeamDocument,
	SeasonDocument,
} from '../../../types.js'
import { validateAuthentication } from '../../../shared/auth.js'
import {
	getCurrentSeason,
	getCurrentSeasonRef,
} from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { formatDateForUser } from '../../../shared/format.js'

interface CreateOfferRequest {
	playerId: string
	teamId: string
	type: 'invitation' | 'request'
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

		const { playerId, teamId, type } = request.data
		const userId = request.auth?.uid ?? ''

		if (!playerId || !teamId || !type) {
			throw new HttpsError(
				'invalid-argument',
				'Player ID, team ID, and type are required'
			)
		}

		if (!['invitation', 'request'].includes(type)) {
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
					if (existingData?.status === 'pending') {
						throw new HttpsError(
							'already-exists',
							'A pending offer already exists between this player and team'
						)
					}
				}
				// Get player, team, and season documents
				const [playerDoc, teamDoc, seasonDoc] = await Promise.all([
					transaction.get(playerRef),
					transaction.get(teamRef),
					transaction.get(seasonRef),
				])

				if (!playerDoc.exists || !teamDoc.exists) {
					throw new HttpsError('not-found', 'Player or team not found')
				}

				if (!seasonDoc.exists) {
					throw new HttpsError('not-found', 'Season not found')
				}

				const playerDocument = playerDoc.data() as PlayerDocument | undefined
				const teamDocument = teamDoc.data() as TeamDocument | undefined
				const seasonData = seasonDoc.data() as SeasonDocument | undefined

				if (!playerDocument || !teamDocument || !seasonData) {
					throw new HttpsError(
						'internal',
						'Unable to retrieve player, team, or season data'
					)
				}

				// Get current user to check admin status
				const currentUserRef = firestore
					.collection(Collections.PLAYERS)
					.doc(userId)
				const currentUserDoc = await transaction.get(currentUserRef)
				const isAdmin = currentUserDoc.data()?.admin === true

				// Validate that registration has not ended (skip for admins)
				if (!isAdmin) {
					const now = new Date()
					const registrationEnd = seasonData.registrationEnd.toDate()

					if (now > registrationEnd) {
						throw new HttpsError(
							'failed-precondition',
							`Team roster changes are not allowed after registration has closed. Registration ended ${formatDateForUser(registrationEnd)}.`
						)
					}
				}

				// Validate authorization based on offer type
				if (type === 'invitation') {
					// User must be a captain of the team
					const userIsCaptain = teamDocument.roster.some(
						(member) => member.player.id === userId && member.captain
					)
					if (!userIsCaptain) {
						throw new HttpsError(
							'permission-denied',
							'Only team captains can send invitations'
						)
					}
				} else if (type === 'request') {
					// User must be the player making the request
					if (userId !== playerId) {
						throw new HttpsError(
							'permission-denied',
							'You can only create requests for yourself'
						)
					}
				}

				// Check if player is already on a team for current season
				const currentSeasonData = playerDocument.seasons.find(
					(season) => season.season.id === seasonRef.id
				)

				if (currentSeasonData?.team) {
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
					status: 'pending',
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
					message: `${type === 'invitation' ? 'Invitation' : 'Request'} created successfully`,
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
