/**
 * Offer-related Firestore operations (invitations and requests)
 */

import { addDoc, updateDoc, query, where, collection } from 'firebase/firestore'

import { firestore } from '../app'
import {
	OfferData,
	OfferStatus,
	OfferType,
	PlayerData,
	TeamData,
	SeasonData,
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

/**
 * Accepts an offer (invitation or request)
 */
export const acceptOffer = (
	offerDocumentReference: DocumentReference<OfferData, DocumentData>
): Promise<void> => {
	return updateDoc(offerDocumentReference, {
		status: OfferStatus.ACCEPTED,
	})
}

/**
 * Rejects an offer (invitation or request)
 */
export const rejectOffer = (
	offerDocumentReference: DocumentReference<OfferData, DocumentData>
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
		| QueryDocumentSnapshot<PlayerData, DocumentData>
		| undefined,
	teamQueryDocumentSnapshot:
		| QueryDocumentSnapshot<TeamData, DocumentData>
		| undefined,
	authenticatedUserDocumentSnapshot:
		| DocumentSnapshot<PlayerData, DocumentData>
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
			OfferData,
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
		| DocumentSnapshot<PlayerData, DocumentData>
		| undefined,
	teamQueryDocumentSnapshot: QueryDocumentSnapshot<TeamData, DocumentData>,
	authenticatedUserDocumentSnapshot:
		| DocumentSnapshot<PlayerData, DocumentData>
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
			OfferData,
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
		| DocumentSnapshot<PlayerData, DocumentData>
		| undefined,
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonData, DocumentData>
		| undefined
): Query<OfferData, DocumentData> | undefined => {
	if (!playerDocumentSnapshot || !currentSeasonQueryDocumentSnapshot) {
		return undefined
	}

	const isCaptain = playerDocumentSnapshot
		?.data()
		?.seasons.some(
			(item) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)

	const team = playerDocumentSnapshot
		?.data()
		?.seasons.find(
			(item) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)?.team

	// If the user is a captain, show all the invitations to join their team
	if (isCaptain) {
		return query(
			collection(firestore, Collections.OFFERS),
			where('team', '==', team),
			where('type', '==', OfferType.INVITATION)
		) as Query<OfferData, DocumentData>
	}

	// If the user is a player, show all their requests to join teams
	return query(
		collection(firestore, Collections.OFFERS),
		where('player', '==', playerDocumentSnapshot.ref),
		where('type', '==', OfferType.REQUEST)
	) as Query<OfferData, DocumentData>
}

/**
 * Creates a query for incoming offers (requests to join captain's team or invitations for players)
 */
export const incomingOffersQuery = (
	playerDocumentSnapshot:
		| DocumentSnapshot<PlayerData, DocumentData>
		| undefined,
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonData, DocumentData>
		| undefined
): Query<OfferData, DocumentData> | undefined => {
	if (!playerDocumentSnapshot || !currentSeasonQueryDocumentSnapshot) {
		return undefined
	}

	const isCaptain = playerDocumentSnapshot
		?.data()
		?.seasons.some(
			(item) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)

	const team = playerDocumentSnapshot
		?.data()
		?.seasons.find(
			(item) =>
				item.season.id === currentSeasonQueryDocumentSnapshot?.id &&
				item.captain
		)?.team

	// If the user is a captain, show all the requests to join their team
	if (isCaptain) {
		return query(
			collection(firestore, Collections.OFFERS),
			where('team', '==', team),
			where('type', '==', OfferType.REQUEST)
		) as Query<OfferData, DocumentData>
	}

	// If the user is a player, show all their invitations to join teams
	return query(
		collection(firestore, Collections.OFFERS),
		where('player', '==', playerDocumentSnapshot.ref),
		where('type', '==', OfferType.INVITATION)
	) as Query<OfferData, DocumentData>
}

/**
 * Creates a query for offers between a specific player and team
 */
export const offersForPlayerByTeamQuery = (
	playerDocumentSnapshot:
		| DocumentSnapshot<PlayerData, DocumentData>
		| undefined,
	teamQueryDocumentSnapshot:
		| QueryDocumentSnapshot<TeamData, DocumentData>
		| undefined
) => {
	if (!playerDocumentSnapshot || !teamQueryDocumentSnapshot) {
		return
	}
	return query(
		collection(firestore, Collections.OFFERS),
		where('player', '==', playerDocumentSnapshot.ref),
		where('team', '==', teamQueryDocumentSnapshot.ref)
	) as Query<OfferData, DocumentData>
}
