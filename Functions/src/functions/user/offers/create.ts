/**
 * Create offer callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerDocument, TeamDocument } from '../../../types.js'
import { validateAuthentication } from '../../../shared/auth.js'
import {
	getCurrentSeason,
	getCurrentSeasonRef,
} from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

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
		const userId = request.auth!.uid

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

			// Check for existing pending offers BEFORE transaction to avoid lock timeout
			const existingOffersSnapshot = await firestore
				.collection(Collections.OFFERS)
				.where('player', '==', playerRef)
				.where('team', '==', teamRef)
				.where('status', '==', 'pending')
				.get()

			if (!existingOffersSnapshot.empty) {
				throw new HttpsError(
					'already-exists',
					'A pending offer already exists between this player and team'
				)
			}

			return await firestore.runTransaction(async (transaction) => {
				// Get player and team documents
				const [playerDoc, teamDoc] = await Promise.all([
					transaction.get(playerRef),
					transaction.get(teamRef),
				])

				if (!playerDoc.exists || !teamDoc.exists) {
					throw new HttpsError('not-found', 'Player or team not found')
				}

				const playerDocument = playerDoc.data() as PlayerDocument | undefined
				const teamDocument = teamDoc.data() as TeamDocument | undefined

				if (!playerDocument || !teamDocument) {
					throw new HttpsError(
						'internal',
						'Unable to retrieve player or team data'
					)
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

				// Create offer document
				const offerData = {
					player: playerRef,
					team: teamRef,
					season: seasonRef,
					type,
					status: 'pending',
					createdBy: firestore.collection(Collections.PLAYERS).doc(userId),
					createdAt: new Date(),
				}

				const offerRef = await firestore
					.collection(Collections.OFFERS)
					.add(offerData)

				logger.info(`Successfully created offer: ${offerRef.id}`, {
					type,
					playerId,
					teamId,
					createdBy: userId,
				})

				return {
					success: true,
					offerId: offerRef.id,
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
