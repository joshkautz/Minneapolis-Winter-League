/**
 * Shared validation utilities and type guards
 */

import {
	PlayerData,
	TeamData,
	SeasonData,
	OfferData,
	GameData,
	WaiverData,
	OfferStatus,
	OfferCreator,
	Collections,
} from './types.js'

/**
 * Type guard to check if an object is PlayerData
 */
export function isPlayerData(obj: any): obj is PlayerData {
	return (
		obj &&
		typeof obj.admin === 'boolean' &&
		typeof obj.email === 'string' &&
		typeof obj.firstname === 'string' &&
		typeof obj.lastname === 'string' &&
		Array.isArray(obj.seasons)
	)
}

/**
 * Type guard to check if an object is TeamData
 */
export function isTeamData(obj: any): obj is TeamData {
	return (
		obj &&
		typeof obj.name === 'string' &&
		typeof obj.registered === 'boolean' &&
		typeof obj.teamId === 'string' &&
		Array.isArray(obj.roster)
	)
}

/**
 * Type guard to check if an object is SeasonData
 */
export function isSeasonData(obj: any): obj is SeasonData {
	return (
		obj &&
		typeof obj.name === 'string' &&
		obj.dateStart &&
		obj.dateEnd &&
		obj.registrationStart &&
		obj.registrationEnd &&
		Array.isArray(obj.teams)
	)
}

/**
 * Type guard to check if an object is OfferData
 */
export function isOfferData(obj: any): obj is OfferData {
	return (
		obj &&
		Object.values(OfferCreator).includes(obj.creator) &&
		Object.values(OfferStatus).includes(obj.status) &&
		typeof obj.creatorName === 'string' &&
		obj.player &&
		obj.team
	)
}

/**
 * Utility function to validate collection names
 */
export function isValidCollection(
	collection: string
): collection is keyof typeof Collections {
	return Object.values(Collections).includes(collection as Collections)
}

/**
 * Utility to safely get a field from DocumentData
 */
export function getField<T>(data: any, field: string): T | undefined {
	if (!data || typeof data !== 'object') return undefined
	return data[field] as T
}

/**
 * Utility to safely get a string field
 */
export function getStringField(data: any, field: string): string | undefined {
	const value = getField<string>(data, field)
	return typeof value === 'string' ? value : undefined
}

/**
 * Utility to safely get a boolean field
 */
export function getBooleanField(data: any, field: string): boolean | undefined {
	const value = getField<boolean>(data, field)
	return typeof value === 'boolean' ? value : undefined
}

/**
 * Utility to safely get a number field
 */
export function getNumberField(data: any, field: string): number | undefined {
	const value = getField<number>(data, field)
	return typeof value === 'number' ? value : undefined
}
