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
import { assertRegistrationOpen } from '../../../shared/registrationWindow.js'
import {
	queueOfferAnsweredEmails,
	queueOfferWithdrawnEmails,
	readTeamOfferContext,
} from '../../../email/teamOfferEmails.js'
import { rethrowAsHttpsError } from '../../../shared/errors.js'

/**
 * What the other side of an offer is told when it is answered, if anything.
 *
 * Rejecting is emailed as declined. Canceling by the side that sent the
 * offer withdraws it, emailed only if its sending was. Canceling by the side
 * it was sent to — a captain canceling a player's request, which the App
 * declines instead — turns it down. An admin on neither side is cleaning up,
 * and nobody is told. Accepting is emailed by the onOfferUpdated trigger.
 */
function offerAnswerEmail({
	status,
	isSender,
	isRecipient,
	sentQuietly,
}: {
	status: UpdateOfferRequest['status']
	isSender: boolean
	isRecipient: boolean
	sentQuietly: boolean
}): 'declined' | 'withdrawn' | null {
	if (status === OfferStatus.REJECTED) return 'declined'
	if (status !== OfferStatus.CANCELED) return null
	if (isSender) return sentQuietly ? null : 'withdrawn'
	return isRecipient ? 'declined' : null
}

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
 * - User must be authorized for this offer: an invitation is answered by its
 *   player and withdrawn by any captain of the team; a request is answered
 *   by the team's captains and withdrawn by its player
 * - When accepting: target player must not be banned for the season
 * - Registration must not have ended
 * - Offer must exist and be in pending status
 * - Atomic transaction with proper cleanup
 * - Admins bypass banned and registration date restrictions
 *
 * Declining emails whoever sent the offer, and withdrawing it emails whoever
 * it was sent to; accepting is emailed by the onOfferUpdated trigger, once
 * the player is really on the team. An invitation is the team's, not the
 * captain's who happened to send it, so any of its captains may withdraw it
 * and the player is told either way.
 */
export const updateOffer = onCall<UpdateOfferRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { data, auth } = request

		// Let the validator's own code through. Flattening it to
		// 'unauthenticated' told a client to log in again when the real
		// problem was an unverified email, which logging in never fixes.
		validateAuthentication(auth)

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
					assertRegistrationOpen(
						seasonData,
						'Team roster changes are not allowed after registration has closed.',
						timezone
					)
				}

				// When accepting an offer, validate the player is not banned (skip for admins)
				// This prevents banned players from joining teams
				if (status === OfferStatus.ACCEPTED && !isAdmin) {
					await validateNotBanned(firestore, offerData.player.id)
				}

				// Check if user is the creator of the offer (for cancellation)
				const isCreator =
					offerData.createdBy && offerData.createdBy.id === userId

				// Whether the caller captains the offer's team this season: they
				// answer its requests and may withdraw any of its invitations.
				const callerSeasonData = (
					await transaction.get(
						playerSeasonRef(firestore, userId, offerData.season.id)
					)
				).data()
				const isTeamCaptain =
					callerSeasonData?.team?.id === offerData.team.id &&
					callerSeasonData?.captain === true

				// The side that sent the offer withdraws it; the side it was sent
				// to answers it. The team sends an invitation, the player a request.
				const isSender =
					offerData.type === OfferType.INVITATION
						? Boolean(isCreator) || isTeamCaptain
						: Boolean(isCreator)
				const isRecipient =
					offerData.type === OfferType.INVITATION
						? userId === offerData.player.id
						: isTeamCaptain

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
						// The player accepts or rejects an invitation sent to them;
						// any captain of the team can withdraw it.
						const canRespondAsRecipient =
							isRecipient &&
							(status === OfferStatus.ACCEPTED ||
								status === OfferStatus.REJECTED)
						const canWithdraw = isSender && status === OfferStatus.CANCELED

						if (!canRespondAsRecipient && !canWithdraw) {
							if (status === OfferStatus.CANCELED) {
								throw new HttpsError(
									'permission-denied',
									'Only a captain of the team can cancel this invitation'
								)
							} else if (status === OfferStatus.REJECTED && isSender) {
								throw new HttpsError(
									'permission-denied',
									'Captains should use canceled status instead of rejected to cancel their invitations'
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
							if (!isTeamCaptain) {
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

				const emailed = offerAnswerEmail({
					status,
					isSender,
					isRecipient,
					sentQuietly: offerData.sentQuietly === true,
				})
				// Read what the email needs before writing.
				const emailContext = emailed
					? await readTeamOfferContext(transaction, firestore, {
							playerId: offerData.player.id,
							teamId: offerData.team.id,
							seasonId: offerData.season.id,
						})
					: null

				// Update offer status
				transaction.update(offerRef, {
					status,
					respondedAt: FieldValue.serverTimestamp(),
					respondedBy: firestore.collection(Collections.PLAYERS).doc(userId),
				})
				if (emailContext && emailed === 'declined') {
					queueOfferAnsweredEmails(transaction, firestore, {
						type: offerData.type,
						accepted: false,
						context: emailContext,
					})
				}
				if (emailContext && emailed === 'withdrawn') {
					queueOfferWithdrawnEmails(transaction, firestore, {
						type: offerData.type,
						context: emailContext,
					})
				}

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
			rethrowAsHttpsError(
				error,
				'The invitation or request could not be answered. Please try again.',
				{ offerId, status, userId: auth?.uid }
			)
		}
	}
)
