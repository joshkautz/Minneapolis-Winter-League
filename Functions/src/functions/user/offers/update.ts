/**
 * Update offer callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	OfferDocument,
	OfferStatus,
	OfferType,
	SeasonDocument,
} from '../../../types.js'
import {
	validateAuthentication,
	validateNotBanned,
} from '../../../shared/auth.js'
import { playerSeasonRef } from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { formatDateForUser } from '../../../shared/format.js'

interface UpdateOfferRequest {
	offerId: string
	status: OfferStatus.ACCEPTED | OfferStatus.REJECTED | OfferStatus.CANCELED
	timezone?: string
}

/**
 * Updates offer status (accept/reject/cancel) with proper authorization
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be authorized for this offer (player for invitation, captain for request)
 * - When accepting: target player must not be banned for the season
 * - Registration must not have ended
 * - Offer must exist and be in pending status
 * - Atomic transaction with proper cleanup
 * - Admins bypass banned and registration date restrictions
 */
export const updateOffer = onCall<UpdateOfferRequest>(
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

		const { offerId, status, timezone } = data

		// Validate inputs
		if (!offerId || !status) {
			throw new HttpsError(
				'invalid-argument',
				'Offer ID and status are required'
			)
		}

		const allowedStatuses: OfferStatus[] = [
			OfferStatus.ACCEPTED,
			OfferStatus.REJECTED,
			OfferStatus.CANCELED,
		]
		if (!allowedStatuses.includes(status)) {
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
				if (offerData.status !== OfferStatus.PENDING) {
					throw new HttpsError(
						'failed-precondition',
						`Offer has already been ${offerData.status}`
					)
				}

				// Get season document to check dates
				const seasonDoc = await transaction.get(offerData.season)
				if (!seasonDoc.exists) {
					throw new HttpsError('not-found', 'Season not found')
				}

				const seasonData = seasonDoc.data() as SeasonDocument

				// Check if user is admin (admins can update any offer)
				const userId = auth?.uid ?? ''
				const userDoc = await transaction.get(
					firestore.collection(Collections.PLAYERS).doc(userId)
				)
				const isAdmin = userDoc.exists && userDoc.data()?.admin === true

				// Validate that registration has not ended (skip for admins)
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

				// When accepting an offer, validate the player is not banned (skip for admins)
				// This prevents banned players from joining teams
				if (status === OfferStatus.ACCEPTED && !isAdmin) {
					await validateNotBanned(
						firestore,
						offerData.player.id,
						offerData.season.id
					)
				}

				// Check if user is the creator of the offer (for cancellation)
				const isCreator =
					offerData.createdBy && offerData.createdBy.id === userId

				// If user is admin, allow them to update any offer
				if (isAdmin) {
					logger.info(`Admin user updating offer`, {
						offerId,
						adminUserId: userId,
						status,
						offerType: offerData.type,
					})
				} else {
					// Validate authorization based on offer type and action for non-admin users
					if (offerData.type === OfferType.INVITATION) {
						// Player can accept/reject invitations sent to them
						// Creator (captain) can cancel their own invitations
						const canRespondAsRecipient =
							userId === offerData.player.id &&
							(status === OfferStatus.ACCEPTED ||
								status === OfferStatus.REJECTED)
						const canCancelAsCreator =
							isCreator && status === OfferStatus.CANCELED

						if (!canRespondAsRecipient && !canCancelAsCreator) {
							if (status === OfferStatus.CANCELED && !isCreator) {
								throw new HttpsError(
									'permission-denied',
									'Only the invitation creator can cancel this invitation'
								)
							} else if (status === OfferStatus.REJECTED && isCreator) {
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
					} else if (offerData.type === OfferType.REQUEST) {
						// Team captains can accept/reject requests to their team.
						// Creator (player) can cancel their own requests.
						const canCancelAsCreator =
							isCreator && status === OfferStatus.CANCELED

						if (canCancelAsCreator) {
							// Allow creator to cancel their own request
						} else {
							// Captain check: read the caller's player season subdoc and
							// confirm they are a captain on the offer's target team for
							// the offer's season.
							const callerSeasonSnap = await transaction.get(
								playerSeasonRef(firestore, userId, offerData.season.id)
							)
							const callerSeasonData = callerSeasonSnap.data()
							const userIsCaptain =
								callerSeasonData?.team?.id === offerData.team.id &&
								callerSeasonData?.captain === true

							if (!userIsCaptain) {
								if (status === OfferStatus.REJECTED) {
									throw new HttpsError(
										'permission-denied',
										'Only team captains can reject join requests'
									)
								} else if (status === OfferStatus.CANCELED) {
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
					respondedAt: FieldValue.serverTimestamp(),
					respondedBy: firestore.collection(Collections.PLAYERS).doc(userId),
				})

				// If rejected or canceled, we're done - the trigger will handle cleanup
				if (
					status === OfferStatus.REJECTED ||
					status === OfferStatus.CANCELED
				) {
					logger.info(`Offer ${status}: ${offerId}`, {
						type: offerData.type,
						respondedBy: userId,
					})

					return {
						success: true,
						status: OfferStatus.REJECTED,
						message: `${offerData.type === OfferType.INVITATION ? 'Invitation' : 'Request'} rejected`,
					}
				}

				// If accepted, the onOfferUpdated trigger will handle adding player to team
				logger.info(`Offer accepted: ${offerId}`, {
					type: offerData.type,
					respondedBy: userId,
				})

				return {
					success: true,
					status: OfferStatus.ACCEPTED,
					message: `${offerData.type === OfferType.INVITATION ? 'Invitation' : 'Request'} accepted`,
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

			logger.error('Error updating offer:', {
				offerId,
				status,
				userId: auth?.uid,
				error: errorMessage,
			})

			throw new HttpsError('internal', errorMessage)
		}
	}
)
