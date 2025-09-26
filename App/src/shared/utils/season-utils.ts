import { DocumentReference } from 'firebase/firestore'
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
export const getPlayerSeasonData = (
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
 * Checks if a player is rostered (has a team) for the specified season
 */
export const isPlayerRosteredForSeason = (
	playerData: PlayerDocument | undefined,
	seasonRef: DocumentReference<SeasonDocument> | undefined
): boolean => {
	const seasonData = getPlayerSeasonData(playerData, seasonRef)
	return Boolean(seasonData?.team)
}
