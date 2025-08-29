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
} from '@/shared/utils'
import type {
	DocumentReference,
	DocumentSnapshot,
	QueryDocumentSnapshot,
	Query,
	CollectionReference,
	DocumentData,
} from '../types'
import type { PlayerSeason } from '@minneapolis-winter-league/shared'

/**
 * Accepts an offer (invitation or request)
 */
export const acceptOffer = (
	offerDocumentReference: DocumentReference<OfferDocument, DocumentData>
): Promise<void> => {
	return updateDoc(offerDocumentReference, {
		status: OfferStatus.ACCEPTED,
	})
}

/**
 * Rejects an offer (invitation or request)
 */
export const rejectOffer = (
	offerDocumentReference: DocumentReference<OfferDocument, DocumentData>
): Promise<void> => {
	return updateDoc(offerDocumentReference, {
		status: OfferStatus.REJECTED,
	})
}

/**
 * Creates an invitation for a player to join a team
 */
export const invitePlayer = (
	playerQueryDocumentSnapshot:
		| QueryDocumentSnapshot<PlayerDocument, DocumentData>
		| undefined,
	teamQueryDocumentSnapshot:
		| QueryDocumentSnapshot<TeamDocument, DocumentData>
		| undefined,
	authenticatedUserDocumentSnapshot:
		| DocumentSnapshot<PlayerDocument, DocumentData>
		| undefined
) => {
	if (
		!playerQueryDocumentSnapshot ||
		!teamQueryDocumentSnapshot ||
		!authenticatedUserDocumentSnapshot
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
			creator: `${authenticatedUserDocumentSnapshot.data()?.firstname} ${authenticatedUserDocumentSnapshot.data()?.lastname}`,
			player: playerQueryDocumentSnapshot.ref,
			playerName:
				playerQueryDocumentSnapshot.data()?.firstname +
				' ' +
				playerQueryDocumentSnapshot.data()?.lastname,
			status: OfferStatus.PENDING,
			team: teamQueryDocumentSnapshot.ref,
			teamName: teamQueryDocumentSnapshot.data()?.name,
		}
	)
}

/**
 * Creates a request for a player to join a team
 */
export const requestToJoinTeam = (
	playerDocumentSnapshot:
		| DocumentSnapshot<PlayerDocument, DocumentData>
		| undefined,
	teamQueryDocumentSnapshot: QueryDocumentSnapshot<TeamDocument, DocumentData>,
	authenticatedUserDocumentSnapshot:
		| DocumentSnapshot<PlayerDocument, DocumentData>
		| undefined
) => {
	if (
		!playerDocumentSnapshot ||
		!teamQueryDocumentSnapshot ||
		!authenticatedUserDocumentSnapshot
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
			creator: `${authenticatedUserDocumentSnapshot.data()?.firstname} ${authenticatedUserDocumentSnapshot.data()?.lastname}`,
			player: playerDocumentSnapshot.ref,
			playerName: `${playerDocumentSnapshot.data()?.firstname} ${playerDocumentSnapshot.data()?.lastname}`,
			status: OfferStatus.PENDING,
			team: teamQueryDocumentSnapshot.ref,
			teamName: teamQueryDocumentSnapshot.data()?.name,
		}
	)
}

/**
 * Creates a query for outgoing offers (invitations sent by captains or requests sent by players)
 */
export const outgoingOffersQuery = (
	playerDocumentSnapshot:
		| DocumentSnapshot<PlayerDocument, DocumentData>
		| undefined,
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument, DocumentData>
		| undefined
): Query<OfferDocument, DocumentData> | undefined => {
	if (!playerDocumentSnapshot || !currentSeasonQueryDocumentSnapshot) {
		return undefined
	}

	const isCaptain = playerDocumentSnapshot
		?.data()
		?.seasons.some(
			(item: PlayerSeason) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)

	const team = playerDocumentSnapshot
		?.data()
		?.seasons.find(
			(item: PlayerSeason) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)?.team

	// If the user is a captain, show all the invitations to join their team
	if (isCaptain) {
		return query(
			collection(firestore, Collections.OFFERS),
			where('team', '==', team),
			where('type', '==', OfferType.INVITATION)
		) as Query<OfferDocument, DocumentData>
	}

	// If the user is a player, show all their requests to join teams
	return query(
		collection(firestore, Collections.OFFERS),
		where('player', '==', playerDocumentSnapshot.ref),
		where('type', '==', OfferType.REQUEST)
	) as Query<OfferDocument, DocumentData>
}

/**
 * Creates a query for incoming offers (requests to join captain's team or invitations for players)
 */
export const incomingOffersQuery = (
	playerDocumentSnapshot:
		| DocumentSnapshot<PlayerDocument, DocumentData>
		| undefined,
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument, DocumentData>
		| undefined
): Query<OfferDocument, DocumentData> | undefined => {
	if (!playerDocumentSnapshot || !currentSeasonQueryDocumentSnapshot) {
		return undefined
	}

	const isCaptain = playerDocumentSnapshot
		?.data()
		?.seasons.some(
			(item: PlayerSeason) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)

	const team = playerDocumentSnapshot
		?.data()
		?.seasons.find(
			(item: PlayerSeason) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)?.team

	// If the user is a captain, show all the requests to join their team
	if (isCaptain) {
		return query(
			collection(firestore, Collections.OFFERS),
			where('team', '==', team),
			where('type', '==', OfferType.REQUEST)
		) as Query<OfferDocument, DocumentData>
	}

	// If the user is a player, show all their invitations to join teams
	return query(
		collection(firestore, Collections.OFFERS),
		where('player', '==', playerDocumentSnapshot.ref),
		where('type', '==', OfferType.INVITATION)
	) as Query<OfferDocument, DocumentData>
}

/**
 * Creates a query for offers between a specific player and team
 */
export const offersForPlayerByTeamQuery = (
	playerDocumentSnapshot:
		| DocumentSnapshot<PlayerDocument, DocumentData>
		| undefined,
	teamQueryDocumentSnapshot:
		| QueryDocumentSnapshot<TeamDocument, DocumentData>
		| undefined
) => {
	if (!playerDocumentSnapshot || !teamQueryDocumentSnapshot) {
		return
	}
	return query(
		collection(firestore, Collections.OFFERS),
		where('player', '==', playerDocumentSnapshot.ref),
		where('team', '==', teamQueryDocumentSnapshot.ref)
	) as Query<OfferDocument, DocumentData>
}
