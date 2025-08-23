/**
 * Offer Management Firebase Functions
 *
 * These functions handle team invitation and request workflows with proper
 * validation and side effects that are too complex for security rules alone.
 */

import { onCall } from 'firebase-functions/v2/https'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'

const firestore = getFirestore()

//////////////////////////////////////////////////////////////////////////////
// OFFER ACCEPTANCE TRIGGER
//////////////////////////////////////////////////////////////////////////////

/**
 * Triggered when an offer document is updated
 * Handles the side effects of accepting offers (adding player to team)
 */
export const onOfferUpdated = onDocumentUpdated(
	{
		document: 'offers/{offerId}',
		region: 'us-central1',
	},
	async (event) => {
		const beforeData = event.data?.before.data()
		const afterData = event.data?.after.data()

		// Only process when status changes to 'accepted'
		if (beforeData?.status !== 'pending' || afterData?.status !== 'accepted') {
			return
		}

		const offerId = event.params.offerId
		logger.info(`Processing accepted offer: ${offerId}`)

		try {
			await firestore.runTransaction(async (transaction) => {
				const offerRef = firestore.collection('offers').doc(offerId)
				const offerDoc = await transaction.get(offerRef)

				if (!offerDoc.exists) {
					throw new Error('Offer not found')
				}

				const offerData = offerDoc.data()!
				const { player: playerRef, team: teamRef, type } = offerData

				// Get current team and player data
				const teamDoc = await teamRef.get()
				const playerDoc = await playerRef.get()

				if (!teamDoc.exists || !playerDoc.exists) {
					throw new Error('Team or player not found')
				}

				const teamData = teamDoc.data()!
				const playerData = playerDoc.data()!

				// Validate the player isn't already on a team for this season
				const seasonRef = teamData.season
				const existingTeamForSeason = playerData.seasons?.find(
					(s: any) => s.season.id === seasonRef.id && s.team !== null
				)

				if (existingTeamForSeason) {
					throw new Error('Player is already on a team for this season')
				}

				// Add player to team roster
				const updatedRoster = [
					...(teamData.roster || []),
					{ captain: false, player: playerRef },
				]

				transaction.update(teamRef, { roster: updatedRoster })

				// Update player's season data
				const updatedSeasons =
					playerData.seasons?.map((season: any) => {
						if (season.season.id === seasonRef.id) {
							return {
								...season,
								team: teamRef,
								captain: false,
							}
						}
						return season
					}) || []

				transaction.update(playerRef, { seasons: updatedSeasons })

				// Delete all other pending offers for this player for this season
				const conflictingOffersQuery = await firestore
					.collection('offers')
					.where('player', '==', playerRef)
					.where('status', '==', 'pending')
					.get()

				conflictingOffersQuery.docs.forEach((doc) => {
					if (doc.id !== offerId) {
						transaction.update(doc.ref, { status: 'rejected' })
					}
				})

				logger.info(`Player added to team successfully`, {
					playerId: playerRef.id,
					teamId: teamRef.id,
					offerType: type,
				})
			})
		} catch (error) {
			logger.error(`Error processing offer acceptance: ${offerId}`, error)

			// Mark the offer as failed and revert status
			await firestore
				.collection('offers')
				.doc(offerId)
				.update({
					status: 'rejected',
					error: error instanceof Error ? error.message : 'Unknown error',
				})
		}
	}
)

//////////////////////////////////////////////////////////////////////////////
// MANUAL OFFER MANAGEMENT
//////////////////////////////////////////////////////////////////////////////

interface CreateOfferRequest {
	playerId: string
	teamId: string
	type: 'invitation' | 'request'
}

export const createOffer = onCall<CreateOfferRequest>(
	{ region: 'us-central1' },
	async (request) => {
		if (!request.auth?.token.email_verified) {
			throw new Error('Authentication and email verification required')
		}

		const { playerId, teamId, type } = request.data
		const userId = request.auth.uid

		if (!playerId || !teamId || !type) {
			throw new Error('Player ID, team ID, and type are required')
		}

		try {
			return await firestore.runTransaction(async (transaction) => {
				// Get team and player documents
				const teamRef = firestore.collection('teams').doc(teamId)
				const playerRef = firestore.collection('players').doc(playerId)
				const currentUserRef = firestore.collection('players').doc(userId)

				const [teamDoc, playerDoc, currentUserDoc] = await Promise.all([
					transaction.get(teamRef),
					transaction.get(playerRef),
					transaction.get(currentUserRef),
				])

				if (!teamDoc.exists || !playerDoc.exists || !currentUserDoc.exists) {
					throw new Error('Team, player, or current user not found')
				}

				const teamData = teamDoc.data()!
				const playerData = playerDoc.data()!
				const currentUserData = currentUserDoc.data()!

				// Validate authorization based on offer type
				if (type === 'invitation') {
					// User must be captain of the team
					const isCaptain = teamData.roster?.some(
						(member: any) => member.captain && member.player.id === userId
					)
					if (!isCaptain) {
						throw new Error('Only team captains can send invitations')
					}
				} else if (type === 'request') {
					// User must be the player requesting
					if (userId !== playerId) {
						throw new Error('Players can only create requests for themselves')
					}
				}

				// Check if player is already on a team for this season
				const seasonRef = teamData.season
				const existingTeamForSeason = playerData.seasons?.find(
					(s: any) => s.season.id === seasonRef.id && s.team !== null
				)

				if (existingTeamForSeason) {
					throw new Error('Player is already on a team for this season')
				}

				// Check for existing pending offers
				const existingOffersQuery = await firestore
					.collection('offers')
					.where('player', '==', playerRef)
					.where('team', '==', teamRef)
					.where('status', '==', 'pending')
					.get()

				if (!existingOffersQuery.empty) {
					throw new Error(
						'Pending offer already exists for this player and team'
					)
				}

				// Create the offer
				const offerRef = firestore.collection('offers').doc()
				const offerData = {
					type,
					creator: `${currentUserData.firstname} ${currentUserData.lastname}`,
					player: playerRef,
					playerName: `${playerData.firstname} ${playerData.lastname}`,
					status: 'pending',
					team: teamRef,
					teamName: teamData.name,
					createdAt: FieldValue.serverTimestamp(),
				}

				transaction.set(offerRef, offerData)

				logger.info(`Offer created: ${offerRef.id}`, {
					type,
					playerId,
					teamId,
					createdBy: userId,
				})

				return { offerId: offerRef.id, success: true }
			})
		} catch (error) {
			logger.error('Error creating offer:', error)
			throw new Error(
				error instanceof Error ? error.message : 'Failed to create offer'
			)
		}
	}
)

//////////////////////////////////////////////////////////////////////////////
// BULK OFFER CLEANUP
//////////////////////////////////////////////////////////////////////////////

/**
 * Function to clean up expired or conflicting offers
 */
export const cleanupOffers = onCall(
	{ region: 'us-central1' },
	async (request) => {
		// Only allow admin users to run cleanup
		if (!request.auth) {
			throw new Error('Authentication required')
		}

		const userId = request.auth.uid
		const userDoc = await firestore.collection('players').doc(userId).get()

		if (!userDoc.exists || !userDoc.data()?.admin) {
			throw new Error('Admin privileges required')
		}

		try {
			let cleanedCount = 0

			// Clean up offers for players who are already on teams
			const pendingOffersQuery = await firestore
				.collection('offers')
				.where('status', '==', 'pending')
				.get()

			const batch = firestore.batch()

			for (const offerDoc of pendingOffersQuery.docs) {
				const offerData = offerDoc.data()
				const playerRef = offerData.player
				const teamRef = offerData.team

				// Get player and team data
				const [playerDoc, teamDoc] = await Promise.all([
					playerRef.get(),
					teamRef.get(),
				])

				if (!playerDoc.exists || !teamDoc.exists) {
					// Clean up offers for non-existent players/teams
					batch.update(offerDoc.ref, { status: 'rejected' })
					cleanedCount++
					continue
				}

				const playerData = playerDoc.data()
				const teamData = teamDoc.data()

				// Check if player is already on a team for this season
				const seasonRef = teamData.season
				const existingTeamForSeason = playerData.seasons?.find(
					(s: any) => s.season.id === seasonRef.id && s.team !== null
				)

				if (existingTeamForSeason) {
					batch.update(offerDoc.ref, { status: 'rejected' })
					cleanedCount++
				}
			}

			if (cleanedCount > 0) {
				await batch.commit()
			}

			logger.info(`Cleaned up ${cleanedCount} offers`)

			return {
				success: true,
				cleanedCount,
				message: `Cleaned up ${cleanedCount} offers`,
			}
		} catch (error) {
			logger.error('Error cleaning up offers:', error)
			throw new Error(
				error instanceof Error ? error.message : 'Failed to cleanup offers'
			)
		}
	}
)
