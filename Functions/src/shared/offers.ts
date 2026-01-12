/**
 * Offer utilities
 * Handles cancellation of pending offers when players join teams
 */

import { Timestamp, Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	DocumentReference,
	OfferDocument,
	OfferStatus,
	PlayerDocument,
	SeasonDocument,
} from '../types.js'

/**
 * Cancels all pending offers for a player in a specific season.
 * This should be called whenever a player joins a team through any mechanism
 * (creating a team, rolling over a team, accepting an offer, or being added by admin).
 *
 * @param firestore - Firestore instance
 * @param playerRef - Reference to the player document
 * @param seasonRef - Reference to the season document
 * @param canceledReason - Human-readable reason for cancellation
 * @param excludeOfferId - Optional offer ID to exclude (used when accepting an offer)
 * @returns Number of offers that were canceled
 */
export async function cancelPendingOffersForPlayer(
	firestore: Firestore,
	playerRef: DocumentReference<PlayerDocument>,
	seasonRef: DocumentReference<SeasonDocument>,
	canceledReason: string,
	excludeOfferId?: string
): Promise<number> {
	const pendingOffersQuery = await firestore
		.collection(Collections.OFFERS)
		.where('player', '==', playerRef)
		.where('season', '==', seasonRef)
		.where('status', '==', 'pending')
		.get()

	if (pendingOffersQuery.empty) {
		return 0
	}

	let canceledCount = 0
	const updatePromises: Promise<FirebaseFirestore.WriteResult>[] = []

	pendingOffersQuery.forEach((offerDoc) => {
		// Skip the excluded offer (if provided)
		if (excludeOfferId && offerDoc.id === excludeOfferId) {
			return
		}

		const updateData: Partial<OfferDocument> = {
			status: OfferStatus.CANCELED,
			respondedAt: Timestamp.now(),
			respondedBy: playerRef,
			canceledReason,
		}

		updatePromises.push(offerDoc.ref.update(updateData))
		canceledCount++
	})

	await Promise.all(updatePromises)

	if (canceledCount > 0) {
		logger.info(
			`Canceled ${canceledCount} pending offer(s) for player ${playerRef.id}`,
			{
				playerId: playerRef.id,
				seasonId: seasonRef.id,
				canceledReason,
				canceledCount,
			}
		)
	}

	return canceledCount
}
