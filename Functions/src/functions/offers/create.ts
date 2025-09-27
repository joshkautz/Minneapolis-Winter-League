/**
 * Create offer callable function
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, PlayerDocument, TeamDocument } from '../../types.js'
import { validateAuthentication } from '../../shared/auth.js'
import { getCurrentSeason, getCurrentSeasonRef } from '../../shared/database.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'

interface CreateOfferRequest {
	playerId: string
	teamId: string
	type: 'invitation' | 'request'
}

export const createOffer = onCall<CreateOfferRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		validateAuthentication(request.auth)

		const { playerId, teamId, type } = request.data
		const userId = request.auth!.uid

		if (!playerId || !teamId || !type) {
			throw new Error('Player ID, team ID, and type are required')
		}

		if (!['invitation', 'request'].includes(type)) {
			throw new Error('Invalid offer type. Must be invitation or request')
		}

		try {
			const firestore = getFirestore()

			return await firestore.runTransaction(async (transaction) => {
				const currentSeason = await getCurrentSeason()
				if (!currentSeason) {
					throw new Error('No current season found')
				}
				const seasonRef = await getCurrentSeasonRef()

				// Get player and team documents
				const playerRef = firestore
					.collection(Collections.PLAYERS)
					.doc(playerId)
				const teamRef = firestore.collection(Collections.TEAMS).doc(teamId)

				const [playerDoc, teamDoc] = await Promise.all([
					transaction.get(playerRef),
					transaction.get(teamRef),
				])

				if (!playerDoc.exists || !teamDoc.exists) {
					throw new Error('Player or team not found')
				}

				const playerDocument = playerDoc.data() as PlayerDocument | undefined
				const teamDocument = teamDoc.data() as TeamDocument | undefined

				if (!playerDocument || !teamDocument) {
					throw new Error('Unable to retrieve player or team data')
				}

				// Validate authorization based on offer type
				if (type === 'invitation') {
					// User must be a captain of the team
					const userIsCaptain = teamDocument.roster.some(
						(member) => member.player.id === userId && member.captain
					)
					if (!userIsCaptain) {
						throw new Error('Only team captains can send invitations')
					}
				} else if (type === 'request') {
					// User must be the player making the request
					if (userId !== playerId) {
						throw new Error('You can only create requests for yourself')
					}
				}

				// Check if player is already on a team for current season
				const currentSeasonData = playerDocument.seasons.find(
					(season) => season.season.id === seasonRef.id
				)

				if (currentSeasonData?.team) {
					throw new Error('Player is already on a team for this season')
				}

				// Check for existing pending offers between this player and team
				const existingOffersQuery = await firestore
					.collection(Collections.OFFERS)
					.where('player', '==', playerRef)
					.where('team', '==', teamRef)
					.where('status', '==', 'pending')
					.get()

				if (!existingOffersQuery.empty) {
					throw new Error(
						'A pending offer already exists between this player and team'
					)
				}

				// For invitations, prevent re-invitation if player previously rejected
				// (but allow re-invitation if captain previously canceled)
				if (type === 'invitation') {
					const rejectedOffersQuery = await firestore
						.collection(Collections.OFFERS)
						.where('player', '==', playerRef)
						.where('team', '==', teamRef)
						.where('type', '==', 'invitation')
						.where('status', '==', 'rejected')
						.get()

					if (!rejectedOffersQuery.empty) {
						throw new Error(
							'Cannot re-invite this player - they previously rejected an invitation from this team'
						)
					}
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
					expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
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
			logger.error('Error creating offer:', {
				playerId,
				teamId,
				type,
				userId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new Error(
				error instanceof Error ? error.message : 'Failed to create offer'
			)
		}
	}
)
