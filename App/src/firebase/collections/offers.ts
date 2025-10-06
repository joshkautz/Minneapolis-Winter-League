/**
 * Offer-related Firestore operations (invitations and requests)
 */

import {
	query,
	where,
	collection,
	type DocumentSnapshot,
	type QueryDocumentSnapshot,
	type Query,
} from 'firebase/firestore'

import { firestore } from '../app'
import {
	OfferDocument,
	OfferStatus,
	OfferType,
	PlayerDocument,
	TeamDocument,
	SeasonDocument,
	Collections,
	PlayerSeason,
} from '@/shared/utils'

/**
 * Creates a query for outgoing offers (invitations sent by captains or requests sent by players)
 */
export const outgoingOffersQuery = (
	playerDocumentSnapshot: DocumentSnapshot<PlayerDocument> | undefined,
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument>
		| undefined
): Query<OfferDocument> | undefined => {
	if (!playerDocumentSnapshot || !currentSeasonQueryDocumentSnapshot) {
		return undefined
	}

	const isCaptain = playerDocumentSnapshot
		.data()
		?.seasons.some(
			(item: PlayerSeason) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)

	const team = playerDocumentSnapshot
		.data()
		?.seasons.find(
			(item: PlayerSeason) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)?.team

	// If the user is a captain, show all the pending, unprocessed invitations to join their team
	if (isCaptain) {
		return query(
			collection(firestore, Collections.OFFERS),
			where('team', '==', team),
			where('type', '==', OfferType.INVITATION),
			where('status', '==', OfferStatus.PENDING)
		) as Query<OfferDocument>
	}

	// If the user is a player, show all their pending, unprocessed requests to join teams
	return query(
		collection(firestore, Collections.OFFERS),
		where('player', '==', playerDocumentSnapshot.ref),
		where('type', '==', OfferType.REQUEST),
		where('status', '==', OfferStatus.PENDING)
	) as Query<OfferDocument>
}

/**
 * Creates a query for incoming offers (requests to join captain's team or invitations for players)
 */
export const incomingOffersQuery = (
	playerDocumentSnapshot: DocumentSnapshot<PlayerDocument> | undefined,
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument>
		| undefined
): Query<OfferDocument> | undefined => {
	if (!playerDocumentSnapshot || !currentSeasonQueryDocumentSnapshot) {
		return undefined
	}

	const isCaptain = playerDocumentSnapshot
		.data()
		?.seasons.some(
			(item: PlayerSeason) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)

	const team = playerDocumentSnapshot
		.data()
		?.seasons.find(
			(item: PlayerSeason) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)?.team

	// If the user is a captain, show all the pending, unprocessed requests to join their team
	if (isCaptain) {
		return query(
			collection(firestore, Collections.OFFERS),
			where('team', '==', team),
			where('type', '==', OfferType.REQUEST),
			where('status', '==', OfferStatus.PENDING)
		) as Query<OfferDocument>
	}

	// If the user is a player, show all their pending, unprocessed invitations to join teams
	return query(
		collection(firestore, Collections.OFFERS),
		where('player', '==', playerDocumentSnapshot.ref),
		where('type', '==', OfferType.INVITATION),
		where('status', '==', OfferStatus.PENDING)
	) as Query<OfferDocument>
}

/**
 * Creates a query for offers between a specific player and team
 */
export const offersForPlayerByTeamQuery = (
	playerDocumentSnapshot: DocumentSnapshot<PlayerDocument> | undefined,
	teamQueryDocumentSnapshot: QueryDocumentSnapshot<TeamDocument> | undefined
) => {
	if (!playerDocumentSnapshot || !teamQueryDocumentSnapshot) {
		return
	}
	return query(
		collection(firestore, Collections.OFFERS),
		where('player', '==', playerDocumentSnapshot.ref),
		where('team', '==', teamQueryDocumentSnapshot.ref)
	) as Query<OfferDocument>
}

/**
 * Creates a query for all pending offers (admin only)
 * Returns all offers with status = 'pending'
 */
export const allPendingOffersQuery = (): Query<OfferDocument> => {
	return query(
		collection(firestore, Collections.OFFERS),
		where('status', '==', OfferStatus.PENDING)
	) as Query<OfferDocument>
}
