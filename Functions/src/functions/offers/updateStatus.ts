/**
 * Update offer status callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, OfferDocument, TeamDocument } from '../../types.js'
import { validateAuthentication } from '../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'

interface UpdateOfferStatusRequest {
	offerId: string
	status: 'accepted' | 'rejected' | 'canceled'
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
		try {
			validateAuthentication(auth)
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Authentication failed'
			throw new HttpsError('unauthenticated', errorMessage)
		}

		const { offerId, status } = data

		// Validate inputs
		if (!offerId || !status) {
			throw new HttpsError(
				'invalid-argument',
				'Offer ID and status are required'
			)
		}

		if (!['accepted', 'rejected', 'canceled'].includes(status)) {
			throw new HttpsError(
				'invalid-argument',
				'Invalid status. Must be accepted, rejected, or canceled'
			)
		}

		try {
			const firestore = getFirestore()

			return await firestore.runTransaction(async (transaction) => {
				// Get offer document
				const offerRef = firestore.collection(Collections.OFFERS).doc(offerId)
				const offerDoc = await transaction.get(offerRef)

				if (!offerDoc.exists) {
					throw new HttpsError('not-found', 'Offer not found')
				}

				const offerData = offerDoc.data() as OfferDocument | undefined
				if (!offerData) {
					throw new HttpsError('internal', 'Invalid offer data')
				}

				// Check if offer is still pending
				if (offerData.status !== 'pending') {
					throw new HttpsError(
						'failed-precondition',
						`Offer has already been ${offerData.status}`
					)
				}

				// Check if user is admin (admins can update any offer)
				const userDoc = await transaction.get(
					firestore.collection(Collections.PLAYERS).doc(auth!.uid)
				)
				const isAdmin = userDoc.exists && userDoc.data()?.admin === true

				// Check if user is the creator of the offer (for cancellation)
				const isCreator =
					offerData.createdBy && offerData.createdBy.id === auth!.uid

				// If user is admin, allow them to update any offer
				if (isAdmin) {
					logger.info(`Admin user updating offer status`, {
						offerId,
						adminUserId: auth!.uid,
						status,
						offerType: offerData.type,
					})
				} else {
					// Validate authorization based on offer type and action for non-admin users
					if (offerData.type === 'invitation') {
						// Player can accept/reject invitations sent to them
						// Creator (captain) can cancel their own invitations
						const canRespondAsRecipient =
							auth!.uid === offerData.player.id &&
							(status === 'accepted' || status === 'rejected')
						const canCancelAsCreator = isCreator && status === 'canceled'

						if (!canRespondAsRecipient && !canCancelAsCreator) {
							if (status === 'canceled' && !isCreator) {
								throw new HttpsError(
									'permission-denied',
									'Only the invitation creator can cancel this invitation'
								)
							} else if (status === 'rejected' && isCreator) {
								throw new HttpsError(
									'permission-denied',
									'Creators should use canceled status instead of rejected to cancel their invitations'
								)
							} else {
								throw new HttpsError(
									'permission-denied',
									'Only the invited player can respond to this invitation, or creator can cancel'
								)
							}
						}
					} else if (offerData.type === 'request') {
						// Team captains can accept/reject requests to their team
						// Creator (player) can cancel their own requests
						const canCancelAsCreator = isCreator && status === 'canceled'

						if (canCancelAsCreator) {
							// Allow creator to cancel their own request
						} else {
							// Check if user is a team captain for accepting/rejecting
							const teamDoc = await offerData.team.get()
							if (!teamDoc.exists) {
								throw new HttpsError('not-found', 'Team not found')
							}

							const teamDocument = teamDoc.data() as TeamDocument | undefined
							const userIsCaptain = teamDocument?.roster?.some(
								(member) => member.player.id === auth!.uid && member.captain
							)

							if (!userIsCaptain) {
								if (status === 'rejected') {
									throw new HttpsError(
										'permission-denied',
										'Only team captains can reject join requests'
									)
								} else if (status === 'canceled') {
									throw new HttpsError(
										'permission-denied',
										'Only the request creator can cancel their own request'
									)
								} else {
									throw new HttpsError(
										'permission-denied',
										'Only team captains can accept join requests'
									)
								}
							}
						}
					}
				}

				// Update offer status
				transaction.update(offerRef, {
					status,
					respondedAt: new Date(),
					respondedBy: firestore.collection(Collections.PLAYERS).doc(auth!.uid),
				})

				// If rejected or canceled, we're done - the trigger will handle cleanup
				if (status === 'rejected' || status === 'canceled') {
					logger.info(`Offer ${status}: ${offerId}`, {
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
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error updating offer status:', {
				offerId,
				status,
				userId: auth!.uid,
				error: errorMessage,
			})

			throw new HttpsError('internal', errorMessage)
		}
	}
)
