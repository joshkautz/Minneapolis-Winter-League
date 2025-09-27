/**
 * Update offer status callable function
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, OfferDocument, TeamDocument } from '../../types.js'
import { validateAuthentication } from '../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'

interface UpdateOfferStatusRequest {
	offerId: string
	status: 'accepted' | 'rejected'
}

/**
 * Updates offer status (accept/reject) with proper authorization
 * Replaces client-side acceptOffer and rejectOffer functions
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be authorized for this offer (player for invitation, captain for request)
 * - Offer must exist and be in pending status
 * - Atomic transaction with proper cleanup
 */
export const updateOfferStatus = onCall<UpdateOfferStatusRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { data, auth } = request

		// Validate authentication
		validateAuthentication(auth)

		const { offerId, status } = data

		// Validate inputs
		if (!offerId || !status) {
			throw new Error('Offer ID and status are required')
		}

		if (!['accepted', 'rejected'].includes(status)) {
			throw new Error('Invalid status. Must be accepted or rejected')
		}

		try {
			const firestore = getFirestore()

			return await firestore.runTransaction(async (transaction) => {
				// Get offer document
				const offerRef = firestore.collection(Collections.OFFERS).doc(offerId)
				const offerDoc = await transaction.get(offerRef)

				if (!offerDoc.exists) {
					throw new Error('Offer not found')
				}

				const offerData = offerDoc.data() as OfferDocument | undefined
				if (!offerData) {
					throw new Error('Invalid offer data')
				}

				// Check if offer is still pending
				if (offerData.status !== 'pending') {
					throw new Error(`Offer has already been ${offerData.status}`)
				}

				// Check if offer has expired
				const now = new Date()
				if (offerData.expiresAt && offerData.expiresAt.toDate() < now) {
					throw new Error('Offer has expired')
				}

				// Validate authorization based on offer type
				if (offerData.type === 'invitation') {
					// Player can accept/reject invitations sent to them
					if (auth!.uid !== offerData.player.id) {
						throw new Error(
							'Only the invited player can respond to this invitation'
						)
					}
				} else if (offerData.type === 'request') {
					// Team captains can accept/reject requests to their team
					const teamDoc = await offerData.team.get()
					if (!teamDoc.exists) {
						throw new Error('Team not found')
					}

					const teamDocument = teamDoc.data() as TeamDocument | undefined
					const userIsCaptain = teamDocument?.roster?.some(
						(member) => member.player.id === auth!.uid && member.captain
					)

					if (!userIsCaptain) {
						throw new Error('Only team captains can respond to join requests')
					}
				}

				// Update offer status
				transaction.update(offerRef, {
					status,
					respondedAt: new Date(),
					respondedBy: firestore.collection(Collections.PLAYERS).doc(auth!.uid),
				})

				// If rejected, we're done - the trigger will handle cleanup
				if (status === 'rejected') {
					logger.info(`Offer rejected: ${offerId}`, {
						type: offerData.type,
						respondedBy: auth!.uid,
					})

					return {
						success: true,
						status: 'rejected',
						message: `${offerData.type === 'invitation' ? 'Invitation' : 'Request'} rejected`,
					}
				}

				// If accepted, the onOfferUpdated trigger will handle adding player to team
				logger.info(`Offer accepted: ${offerId}`, {
					type: offerData.type,
					respondedBy: auth!.uid,
				})

				return {
					success: true,
					status: 'accepted',
					message: `${offerData.type === 'invitation' ? 'Invitation' : 'Request'} accepted`,
				}
			})
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error updating offer status:', {
				offerId,
				status,
				userId: auth!.uid,
				error: errorMessage,
			})

			// Re-throw the original error message for better user experience
			throw new Error(errorMessage)
		}
	}
)
