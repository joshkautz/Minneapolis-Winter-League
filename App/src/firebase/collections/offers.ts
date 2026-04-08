/**
 * Offer-related Firestore operations (invitations and requests)
 *
 * Caller pattern after the 2026 data model migration:
 *   const { authStateUser, authenticatedUserSeasonsSnapshot } = useAuthContext()
 *   const { currentSeasonQueryDocumentSnapshot } = useSeasonsContext()
 *   const playerRef = getPlayerRef(authStateUser)
 *   useCollection(outgoingOffersQuery(
 *     playerRef,
 *     authenticatedUserSeasonsSnapshot,
 *     currentSeasonQueryDocumentSnapshot
 *   ))
 */

import {
	query,
	where,
	collection,
	type DocumentReference,
	type QueryDocumentSnapshot,
	type Query,
	type QuerySnapshot,
} from 'firebase/firestore'

import { firestore } from '../app'
import {
	OfferDocument,
	OfferStatus,
	OfferType,
	PlayerDocument,
	PlayerSeasonDocument,
	TeamDocument,
	SeasonDocument,
	Collections,
} from '@/shared/utils'

/**
 * Look up the player's per-season subdoc for the current season and return
 * `{ isCaptain, teamRef }` so callers can branch on captain-vs-player logic.
 */
const playerSeasonContext = (
	playerSeasonsSnapshot: QuerySnapshot<PlayerSeasonDocument> | undefined,
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument>
		| undefined
): {
	isCaptain: boolean
	teamRef: DocumentReference<TeamDocument> | null | undefined
} => {
	if (!playerSeasonsSnapshot || !currentSeasonQueryDocumentSnapshot) {
		return { isCaptain: false, teamRef: undefined }
	}
	const seasonData = playerSeasonsSnapshot.docs
		.find((d) => d.id === currentSeasonQueryDocumentSnapshot.id)
		?.data()
	return {
		isCaptain: seasonData?.captain === true,
		teamRef: seasonData?.team ?? null,
	}
}

/**
 * Outgoing offers — invitations sent by captains, or requests sent by players.
 */
export const outgoingOffersQuery = (
	playerRef: DocumentReference<PlayerDocument> | undefined,
	playerSeasonsSnapshot: QuerySnapshot<PlayerSeasonDocument> | undefined,
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument>
		| undefined
): Query<OfferDocument> | undefined => {
	if (!playerRef || !currentSeasonQueryDocumentSnapshot) return undefined

	const { isCaptain, teamRef } = playerSeasonContext(
		playerSeasonsSnapshot,
		currentSeasonQueryDocumentSnapshot
	)

	if (isCaptain && teamRef) {
		return query(
			collection(firestore, Collections.OFFERS),
			where('team', '==', teamRef),
			where('type', '==', OfferType.INVITATION),
			where('status', '==', OfferStatus.PENDING)
		) as Query<OfferDocument>
	}

	return query(
		collection(firestore, Collections.OFFERS),
		where('player', '==', playerRef),
		where('type', '==', OfferType.REQUEST),
		where('status', '==', OfferStatus.PENDING)
	) as Query<OfferDocument>
}

/**
 * Incoming offers — requests to join the captain's team, or invitations
 * sent to a player.
 */
export const incomingOffersQuery = (
	playerRef: DocumentReference<PlayerDocument> | undefined,
	playerSeasonsSnapshot: QuerySnapshot<PlayerSeasonDocument> | undefined,
	currentSeasonQueryDocumentSnapshot:
		| QueryDocumentSnapshot<SeasonDocument>
		| undefined
): Query<OfferDocument> | undefined => {
	if (!playerRef || !currentSeasonQueryDocumentSnapshot) return undefined

	const { isCaptain, teamRef } = playerSeasonContext(
		playerSeasonsSnapshot,
		currentSeasonQueryDocumentSnapshot
	)

	if (isCaptain && teamRef) {
		return query(
			collection(firestore, Collections.OFFERS),
			where('team', '==', teamRef),
			where('type', '==', OfferType.REQUEST),
			where('status', '==', OfferStatus.PENDING)
		) as Query<OfferDocument>
	}

	return query(
		collection(firestore, Collections.OFFERS),
		where('player', '==', playerRef),
		where('type', '==', OfferType.INVITATION),
		where('status', '==', OfferStatus.PENDING)
	) as Query<OfferDocument>
}

/**
 * Creates a query for offers between a specific player and team.
 */
export const offersForPlayerByTeamQuery = (
	playerRef: DocumentReference<PlayerDocument> | undefined,
	teamRef: DocumentReference<TeamDocument> | undefined
) => {
	if (!playerRef || !teamRef) {
		return
	}
	return query(
		collection(firestore, Collections.OFFERS),
		where('player', '==', playerRef),
		where('team', '==', teamRef)
	) as Query<OfferDocument>
}

/**
 * Creates a query for all pending offers (admin only).
 */
export const allPendingOffersQuery = (): Query<OfferDocument> => {
	return query(
		collection(firestore, Collections.OFFERS),
		where('status', '==', OfferStatus.PENDING)
	) as Query<OfferDocument>
}
