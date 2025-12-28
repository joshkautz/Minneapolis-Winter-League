import { DocumentReference, QuerySnapshot } from 'firebase/firestore'
import { PlayerDocument, PlayerSeason, SeasonDocument } from '@/types'

/**
 * Utility functions for working with season data
 *
 * Centralizes the common pattern of finding season-specific data in player documents
 * to reduce code duplication across components.
 */

/**
 * Extracts season-specific data from a player document
 *
 * @param playerData - The player document data
 * @param seasonRef - Reference to the season to find
 * @returns The PlayerSeason object for the specified season, or undefined if not found
 */
const getPlayerSeasonData = (
	playerData: PlayerDocument | undefined,
	seasonRef: DocumentReference<SeasonDocument> | undefined
): PlayerSeason | undefined => {
	if (!playerData?.seasons || !seasonRef?.id) {
		return undefined
	}

	return playerData.seasons.find(
		(season: PlayerSeason) => season.season.id === seasonRef.id
	)
}

/**
 * Checks if a player is a captain for the specified season
 */
export const isPlayerCaptainForSeason = (
	playerData: PlayerDocument | undefined,
	seasonRef: DocumentReference<SeasonDocument> | undefined
): boolean => {
	const seasonData = getPlayerSeasonData(playerData, seasonRef)
	return Boolean(seasonData?.captain)
}

/**
 * Checks if a player has paid for the specified season
 */
export const isPlayerPaidForSeason = (
	playerData: PlayerDocument | undefined,
	seasonRef: DocumentReference<SeasonDocument> | undefined
): boolean => {
	const seasonData = getPlayerSeasonData(playerData, seasonRef)
	return Boolean(seasonData?.paid)
}

/**
 * Checks if a player has signed the waiver for the specified season
 */
export const isPlayerSignedForSeason = (
	playerData: PlayerDocument | undefined,
	seasonRef: DocumentReference<SeasonDocument> | undefined
): boolean => {
	const seasonData = getPlayerSeasonData(playerData, seasonRef)
	return Boolean(seasonData?.signed)
}

/**
 * Checks if a player paid for the previous season (making them eligible for returning player discount)
 *
 * @param playerData - The player document data
 * @param seasonsSnapshot - Snapshot of all seasons (expected to be ordered by dateStart descending)
 * @returns true if player paid for the immediately previous season
 */
export const didPlayerPayPreviousSeason = (
	playerData: PlayerDocument | undefined,
	seasonsSnapshot: QuerySnapshot<SeasonDocument> | undefined
): boolean => {
	// Need player data and at least 2 seasons (current + previous)
	if (
		!playerData?.seasons ||
		!seasonsSnapshot ||
		seasonsSnapshot.docs.length < 2
	) {
		return false
	}

	// Seasons are ordered by dateStart descending
	// Index 0 = current season, Index 1 = previous season
	const previousSeasonDoc = seasonsSnapshot.docs[1]

	if (!previousSeasonDoc) {
		return false
	}

	// Check if the player has a season entry for the previous season with paid: true
	const previousSeasonData = playerData.seasons.find(
		(season: PlayerSeason) => season.season.id === previousSeasonDoc.id
	)

	return Boolean(previousSeasonData?.paid)
}
