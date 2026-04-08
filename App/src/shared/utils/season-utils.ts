import { DocumentReference, QuerySnapshot } from 'firebase/firestore'
import { PlayerSeasonDocument, SeasonDocument } from '@/types'

/**
 * Utility functions for working with player season data.
 *
 * After the 2026 data model migration, player season data lives in a
 * subcollection at `players/{uid}/seasons/{seasonId}`. These helpers take
 * a `QuerySnapshot<PlayerSeasonDocument>` (typically from
 * `useAuthContext().authenticatedUserSeasonsSnapshot`) and look up the
 * subdoc for a given season.
 */

/**
 * Find the player's season subdoc data for a specific season.
 */
const getPlayerSeasonData = (
	seasonsSnapshot: QuerySnapshot<PlayerSeasonDocument> | undefined,
	seasonRef: DocumentReference<SeasonDocument> | undefined
): PlayerSeasonDocument | undefined => {
	if (!seasonsSnapshot || !seasonRef?.id) {
		return undefined
	}
	const docSnap = seasonsSnapshot.docs.find((d) => d.id === seasonRef.id)
	return docSnap?.data()
}

/**
 * Checks if a player is a captain for the specified season.
 */
export const isPlayerCaptainForSeason = (
	seasonsSnapshot: QuerySnapshot<PlayerSeasonDocument> | undefined,
	seasonRef: DocumentReference<SeasonDocument> | undefined
): boolean => {
	const seasonData = getPlayerSeasonData(seasonsSnapshot, seasonRef)
	return Boolean(seasonData?.captain)
}

/**
 * Checks if a player has paid for the specified season.
 */
export const isPlayerPaidForSeason = (
	seasonsSnapshot: QuerySnapshot<PlayerSeasonDocument> | undefined,
	seasonRef: DocumentReference<SeasonDocument> | undefined
): boolean => {
	const seasonData = getPlayerSeasonData(seasonsSnapshot, seasonRef)
	return Boolean(seasonData?.paid)
}

/**
 * Checks if a player has signed the waiver for the specified season.
 */
export const isPlayerSignedForSeason = (
	seasonsSnapshot: QuerySnapshot<PlayerSeasonDocument> | undefined,
	seasonRef: DocumentReference<SeasonDocument> | undefined
): boolean => {
	const seasonData = getPlayerSeasonData(seasonsSnapshot, seasonRef)
	return Boolean(seasonData?.signed)
}

/**
 * Checks if a player paid for the previous season (making them eligible
 * for the returning-player discount).
 */
export const didPlayerPayPreviousSeason = (
	seasonsSnapshot: QuerySnapshot<PlayerSeasonDocument> | undefined,
	allSeasonsSnapshot: QuerySnapshot<SeasonDocument> | undefined
): boolean => {
	if (
		!seasonsSnapshot ||
		!allSeasonsSnapshot ||
		allSeasonsSnapshot.docs.length < 2
	) {
		return false
	}
	// allSeasonsSnapshot is ordered by dateStart descending, so index 1 is "previous".
	const previousSeasonDoc = allSeasonsSnapshot.docs[1]
	if (!previousSeasonDoc) return false
	const previousPlayerSeason = seasonsSnapshot.docs
		.find((d) => d.id === previousSeasonDoc.id)
		?.data()
	return Boolean(previousPlayerSeason?.paid)
}
