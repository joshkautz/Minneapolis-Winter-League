/**
 * Validation utilities and type guards for Functions
 */

import {
	PlayerDocument,
	PlayerSeason,
	TeamDocument,
	TeamRosterPlayer,
	SeasonDocument,
	OfferDocument,
	GameDocument,
	WaiverDocument,
	CheckoutSessionDocument,
	OfferStatus,
	OfferType,
	GameType,
	Collections,
} from './types.js'

/**
 * Helper function to safely check if value is a non-null object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object'
}

/**
 * Type guard to check if an object is PlayerDocument
 */
export function isPlayerDocument(obj: unknown): obj is PlayerDocument {
	if (!isRecord(obj)) return false
	return (
		'admin' in obj &&
		typeof obj.admin === 'boolean' &&
		'email' in obj &&
		typeof obj.email === 'string' &&
		'firstname' in obj &&
		typeof obj.firstname === 'string' &&
		'lastname' in obj &&
		typeof obj.lastname === 'string' &&
		'seasons' in obj &&
		Array.isArray(obj.seasons)
	)
}

/**
 * Type guard to check if an object is PlayerSeason
 */
export function isPlayerSeason(obj: unknown): obj is PlayerSeason {
	if (!isRecord(obj)) return false
	return (
		'banned' in obj &&
		typeof obj.banned === 'boolean' &&
		'captain' in obj &&
		typeof obj.captain === 'boolean' &&
		'paid' in obj &&
		typeof obj.paid === 'boolean' &&
		'signed' in obj &&
		typeof obj.signed === 'boolean' &&
		'season' in obj &&
		isRecord(obj.season) &&
		'id' in obj.season &&
		'team' in obj &&
		(obj.team === null || (isRecord(obj.team) && 'id' in obj.team))
	)
}

/**
 * Type guard to check if an object is TeamDocument
 */
export function isTeamDocument(obj: unknown): obj is TeamDocument {
	if (!isRecord(obj)) return false
	return (
		'logo' in obj &&
		(obj.logo === null || typeof obj.logo === 'string') &&
		'name' in obj &&
		typeof obj.name === 'string' &&
		'placement' in obj &&
		(obj.placement === null || typeof obj.placement === 'number') &&
		'registered' in obj &&
		typeof obj.registered === 'boolean' &&
		'registeredDate' in obj &&
		obj.registeredDate !== null &&
		obj.registeredDate !== undefined &&
		'roster' in obj &&
		Array.isArray(obj.roster) &&
		'season' in obj &&
		isRecord(obj.season) &&
		'id' in obj.season &&
		'storagePath' in obj &&
		(obj.storagePath === null || typeof obj.storagePath === 'string') &&
		'teamId' in obj &&
		typeof obj.teamId === 'string'
	)
}

/**
 * Type guard to check if an object is SeasonDocument
 */
export function isSeasonDocument(obj: unknown): obj is SeasonDocument {
	if (!isRecord(obj)) return false
	return (
		'dateEnd' in obj &&
		obj.dateEnd !== null &&
		obj.dateEnd !== undefined &&
		typeof obj.dateEnd === 'object' &&
		'dateStart' in obj &&
		obj.dateStart !== null &&
		obj.dateStart !== undefined &&
		typeof obj.dateStart === 'object' &&
		'name' in obj &&
		typeof obj.name === 'string' &&
		'registrationEnd' in obj &&
		obj.registrationEnd !== null &&
		obj.registrationEnd !== undefined &&
		typeof obj.registrationEnd === 'object' &&
		'registrationStart' in obj &&
		obj.registrationStart !== null &&
		obj.registrationStart !== undefined &&
		typeof obj.registrationStart === 'object' &&
		'teams' in obj &&
		Array.isArray(obj.teams)
	)
}

/**
 * Type guard to check if an object is OfferDocument
 */
export function isOfferDocument(obj: unknown): obj is OfferDocument {
	if (!isRecord(obj)) return false
	return (
		'type' in obj &&
		Object.values(OfferType).includes(obj.type as OfferType) &&
		'creator' in obj &&
		typeof obj.creator === 'string' &&
		'player' in obj &&
		isRecord(obj.player) &&
		'id' in obj.player &&
		'playerName' in obj &&
		typeof obj.playerName === 'string' &&
		'status' in obj &&
		Object.values(OfferStatus).includes(obj.status as OfferStatus) &&
		'team' in obj &&
		isRecord(obj.team) &&
		'id' in obj.team &&
		'teamName' in obj &&
		typeof obj.teamName === 'string'
	)
}

/**
 * Type guard to check if an object is TeamRosterPlayer
 */
export function isTeamRosterPlayer(obj: unknown): obj is TeamRosterPlayer {
	if (!isRecord(obj)) return false
	return (
		'captain' in obj &&
		typeof obj.captain === 'boolean' &&
		'player' in obj &&
		obj.player !== null &&
		obj.player !== undefined
	)
}

/**
 * Type guard to check if an object is GameDocument
 */
export function isGameDocument(obj: unknown): obj is GameDocument {
	if (!isRecord(obj)) return false
	return (
		'away' in obj &&
		(obj.away === null || (obj.away !== null && obj.away !== undefined)) &&
		'awayScore' in obj &&
		typeof obj.awayScore === 'number' &&
		'date' in obj &&
		obj.date !== null &&
		obj.date !== undefined &&
		'field' in obj &&
		typeof obj.field === 'number' &&
		'home' in obj &&
		(obj.home === null || (obj.home !== null && obj.home !== undefined)) &&
		'homeScore' in obj &&
		typeof obj.homeScore === 'number' &&
		'season' in obj &&
		obj.season !== null &&
		obj.season !== undefined &&
		'type' in obj &&
		Object.values(GameType).includes(obj.type as GameType)
	)
}

/**
 * Type guard to check if an object is WaiverDocument
 */
export function isWaiverDocument(obj: unknown): obj is WaiverDocument {
	if (!isRecord(obj)) return false
	return (
		'player' in obj &&
		obj.player !== null &&
		obj.player !== undefined &&
		'signatureRequestId' in obj &&
		typeof obj.signatureRequestId === 'string'
	)
}

/**
 * Type guard to check if an object is CheckoutSessionDocument
 */
export function isCheckoutSessionDocument(
	obj: unknown
): obj is CheckoutSessionDocument {
	if (!isRecord(obj)) return false
	return (
		'cancel_url' in obj &&
		typeof obj.cancel_url === 'string' &&
		'client' in obj &&
		typeof obj.client === 'string' &&
		'created' in obj &&
		obj.created !== null &&
		obj.created !== undefined &&
		'mode' in obj &&
		typeof obj.mode === 'string' &&
		'price' in obj &&
		typeof obj.price === 'string' &&
		'sessionId' in obj &&
		typeof obj.sessionId === 'string' &&
		'success_url' in obj &&
		typeof obj.success_url === 'string' &&
		'url' in obj &&
		typeof obj.url === 'string'
	)
}

/**
 * Utility function to validate collection names
 */
export function isValidCollection(
	collection: string
): collection is Collections {
	return Object.values(Collections).includes(collection as Collections)
}

/**
 * Utility to safely get a field from DocumentData
 */
export function getField<T>(data: unknown, field: string): T | undefined {
	if (!isRecord(data)) return undefined
	return data[field] as T
}

/**
 * Utility to safely get a string field
 */
export function getStringField(
	data: unknown,
	field: string
): string | undefined {
	const value = getField<string>(data, field)
	return typeof value === 'string' ? value : undefined
}

/**
 * Utility to safely get a boolean field
 */
export function getBooleanField(
	data: unknown,
	field: string
): boolean | undefined {
	const value = getField<boolean>(data, field)
	return typeof value === 'boolean' ? value : undefined
}

/**
 * Utility to safely get a number field
 */
export function getNumberField(
	data: unknown,
	field: string
): number | undefined {
	const value = getField<number>(data, field)
	return typeof value === 'number' ? value : undefined
}
