/**
 * Offer utilities
 * Handles cancellation of pending offers when players join teams
 *
 * A player on a team this season can hold no pending offer that season, so
 * joining one — by accepting an offer, creating or rolling over a team, or
 * being added by an admin — closes the rest, and each of those teams'
 * captains is told why.
 */

import {
	FieldValue,
	type Firestore,
	type QueryDocumentSnapshot,
	type Transaction,
} from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	DocumentReference,
	OfferDocument,
	OfferStatus,
	OfferType,
	PlayerDocument,
	SeasonDocument,
} from '../types.js'
import { playerSeasonRef, teamSeasonRef } from './database.js'
import {
	queuePlayerJoinedElsewhereEmails,
	readTeamOfferContext,
	type TeamOfferContext,
} from '../email/teamOfferEmails.js'

/** A pending offer to close, with what telling its team needs. */
export interface PendingOfferToClose {
	ref: DocumentReference
	type: OfferType
	/** Null for an offer with no team, which is closed without an email. */
	context: TeamOfferContext | null
}

/**
 * Reads the player's pending offers in the season, other than
 * `excludeOfferId`, and what telling their teams needs. Transactional reads:
 * call it before the transaction's first write.
 */
export async function readPendingOffersToClose(
	transaction: Transaction,
	firestore: Firestore,
	{
		playerRef,
		seasonRef,
		excludeOfferId,
	}: {
		playerRef: DocumentReference<PlayerDocument>
		seasonRef: DocumentReference<SeasonDocument>
		excludeOfferId?: string
	}
): Promise<PendingOfferToClose[]> {
	const pending = (
		await transaction.get(
			firestore
				.collection(Collections.OFFERS)
				.where('player', '==', playerRef)
				.where('season', '==', seasonRef)
				.where('status', '==', OfferStatus.PENDING)
		)
	).docs.filter((doc) => doc.id !== excludeOfferId)

	return Promise.all(
		pending.map(async (doc: QueryDocumentSnapshot) => {
			const offer = doc.data() as Partial<OfferDocument>
			const teamId = offer.team?.id
			return {
				ref: doc.ref,
				type: offer.type ?? OfferType.INVITATION,
				context: teamId
					? await readTeamOfferContext(transaction, firestore, {
							playerId: playerRef.id,
							teamId,
							seasonId: seasonRef.id,
						})
					: null,
			}
		})
	)
}

/** Cancels the offers and tells each team's captains where the player went. */
export function closePendingOffers(
	transaction: Transaction,
	firestore: Firestore,
	offers: PendingOfferToClose[],
	{
		playerRef,
		canceledReason,
		joinedTeamName,
	}: {
		playerRef: DocumentReference<PlayerDocument>
		canceledReason: string
		joinedTeamName: string
	}
): void {
	for (const offer of offers) {
		transaction.update(offer.ref, {
			status: OfferStatus.CANCELED,
			respondedAt: FieldValue.serverTimestamp(),
			respondedBy: playerRef,
			canceledReason,
		})
		if (offer.context) {
			queuePlayerJoinedElsewhereEmails(transaction, firestore, {
				type: offer.type,
				context: offer.context,
				joinedTeamName,
			})
		}
	}
}

/**
 * Cancels all pending offers for a player in a specific season, once they
 * are on a team, and tells those teams. Call it after the change that put
 * them on the team (creating a team, rolling one over, an admin adding
 * them); accepting an offer does the same inside its own transaction.
 *
 * @param firestore - Firestore instance
 * @param playerRef - Reference to the player document
 * @param seasonRef - Reference to the season document
 * @param canceledReason - Human-readable reason for cancellation
 * @returns Number of offers that were canceled
 */
export async function cancelPendingOffersForPlayer(
	firestore: Firestore,
	playerRef: DocumentReference<PlayerDocument>,
	seasonRef: DocumentReference<SeasonDocument>,
	canceledReason: string
): Promise<number> {
	const canceledCount = await firestore.runTransaction(async (transaction) => {
		const offers = await readPendingOffersToClose(transaction, firestore, {
			playerRef,
			seasonRef,
		})
		if (offers.length === 0) return 0

		// The team the player is on now, named in the emails.
		const joinedTeamId = (
			await transaction.get(
				playerSeasonRef(firestore, playerRef.id, seasonRef.id)
			)
		).data()?.team?.id
		const joinedTeamName = joinedTeamId
			? (
					await transaction.get(
						teamSeasonRef(firestore, joinedTeamId, seasonRef.id)
					)
				).data()?.name
			: undefined

		closePendingOffers(transaction, firestore, offers, {
			playerRef,
			canceledReason,
			joinedTeamName: joinedTeamName ?? 'another team',
		})
		return offers.length
	})

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
