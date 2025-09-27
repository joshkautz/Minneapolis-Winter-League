/**
 * Offer-related Firestore operations (invitations and requests)
 */

import { addDoc, updateDoc, query, where, collection } from 'firebase/firestore'

import { firestore } from '../app'
import {
	OfferDocument,
	OfferStatus,
	OfferType,
	PlayerDocument,
	TeamDocument,
	SeasonDocument,
	Collections,
	DocumentData,
	PlayerSeason,
} from '@/shared/utils'
import type {
	DocumentReference,
	DocumentSnapshot,
	QueryDocumentSnapshot,
	Query,
	CollectionReference,
} from 'firebase/firestore'

/**
 * Accepts an offer (invitation or request)
 */
export const acceptOffer = (
	offerDocumentReference: DocumentReference<OfferDocument>
): Promise<void> => {
	return updateDoc(offerDocumentReference, {
		status: OfferStatus.ACCEPTED,
	})
}

/**
 * Rejects an offer (invitation or request)
 */
export const rejectOffer = (
	offerDocumentReference: DocumentReference<OfferDocument>
): Promise<void> => {
	return updateDoc(offerDocumentReference, {
		status: OfferStatus.REJECTED,
	})
}

/**
 * Creates an invitation for a player to join a team
 * @deprecated Use createOfferViaFunction instead for proper server-side validation
 */
export const invitePlayer = (
	playerQueryDocumentSnapshot:
		| QueryDocumentSnapshot<PlayerDocument>
		| undefined,
	teamQueryDocumentSnapshot: QueryDocumentSnapshot<TeamDocument> | undefined,
	authenticatedUserDocumentSnapshot:
		| DocumentSnapshot<PlayerDocument>
		| undefined,
	seasonRef: DocumentReference<SeasonDocument> | undefined
) => {
	if (
		!playerQueryDocumentSnapshot ||
		!teamQueryDocumentSnapshot ||
		!authenticatedUserDocumentSnapshot ||
		!seasonRef
	) {
		return
	}
	return addDoc(
		collection(firestore, Collections.OFFERS) as CollectionReference<
			OfferDocument,
			DocumentData
		>,
		{
			type: OfferType.INVITATION,
			createdBy: authenticatedUserDocumentSnapshot.ref,
			createdAt: new Date() as any,
			expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) as any, // 7 days
			player: playerQueryDocumentSnapshot.ref,
			season: seasonRef,
			status: OfferStatus.PENDING,
			team: teamQueryDocumentSnapshot.ref,
		}
	)
}

/**
 * Creates a request for a player to join a team
 * @deprecated Use createOfferViaFunction instead for proper server-side validation
 */
export const requestToJoinTeam = (
	playerDocumentSnapshot: DocumentSnapshot<PlayerDocument> | undefined,
	teamQueryDocumentSnapshot: QueryDocumentSnapshot<TeamDocument>,
	authenticatedUserDocumentSnapshot:
		| DocumentSnapshot<PlayerDocument>
		| undefined,
	seasonRef: DocumentReference<SeasonDocument> | undefined
) => {
	if (
		!playerDocumentSnapshot ||
		!teamQueryDocumentSnapshot ||
		!authenticatedUserDocumentSnapshot ||
		!seasonRef
	) {
		return
	}
	return addDoc(
		collection(firestore, Collections.OFFERS) as CollectionReference<
			OfferDocument,
			DocumentData
		>,
		{
			type: OfferType.REQUEST,
			createdBy: authenticatedUserDocumentSnapshot.ref,
			createdAt: new Date() as any,
			expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) as any, // 7 days
			player: playerDocumentSnapshot.ref,
			season: seasonRef,
			status: OfferStatus.PENDING,
			team: teamQueryDocumentSnapshot.ref,
		}
	)
}

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
