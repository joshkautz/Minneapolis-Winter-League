/**
 * Validation utilities and type guards for App
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

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
} from './types'

/**
 * Type guard to check if an object is PlayerDocument
 */
export function isPlayerDocument(obj: any): obj is PlayerDocument {
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
 * Type guard to check if an object is PlayerSeason
 */
export function isPlayerSeason(obj: any): obj is PlayerSeason {
	return (
		obj &&
		typeof obj.banned === 'boolean' &&
		typeof obj.captain === 'boolean' &&
		typeof obj.paid === 'boolean' &&
		typeof obj.signed === 'boolean' &&
		obj.season &&
		typeof obj.season === 'object' &&
		'id' in obj.season &&
		(obj.team === null ||
			(obj.team && typeof obj.team === 'object' && 'id' in obj.team))
	)
}

/**
 * Type guard to check if an object is TeamDocument
 */
export function isTeamDocument(obj: any): obj is TeamDocument {
	return (
		obj &&
		(obj.logo === null || typeof obj.logo === 'string') &&
		typeof obj.name === 'string' &&
		(obj.placement === null || typeof obj.placement === 'number') &&
		typeof obj.registered === 'boolean' &&
		obj.registeredDate &&
		Array.isArray(obj.roster) &&
		obj.season &&
		typeof obj.season === 'object' &&
		'id' in obj.season &&
		(obj.storagePath === null || typeof obj.storagePath === 'string') &&
		typeof obj.teamId === 'string'
	)
}

/**
 * Type guard to check if an object is SeasonDocument
 */
export function isSeasonDocument(obj: any): obj is SeasonDocument {
	return (
		obj &&
		obj.dateEnd &&
		typeof obj.dateEnd === 'object' &&
		obj.dateStart &&
		typeof obj.dateStart === 'object' &&
		typeof obj.name === 'string' &&
		obj.registrationEnd &&
		typeof obj.registrationEnd === 'object' &&
		obj.registrationStart &&
		typeof obj.registrationStart === 'object' &&
		Array.isArray(obj.teams)
	)
}

/**
 * Type guard to check if an object is OfferDocument
 */
export function isOfferDocument(obj: any): obj is OfferDocument {
	return (
		obj &&
		Object.values(OfferType).includes(obj.type) &&
		obj.createdAt &&
		obj.player &&
		typeof obj.player === 'object' &&
		'id' in obj.player &&
		Object.values(OfferStatus).includes(obj.status) &&
		obj.team &&
		typeof obj.team === 'object' &&
		'id' in obj.team
	)
}

/**
 * Type guard to check if an object is TeamRosterPlayer
 */
export function isTeamRosterPlayer(obj: any): obj is TeamRosterPlayer {
	return obj && typeof obj.captain === 'boolean' && obj.player
}

/**
 * Type guard to check if an object is GameDocument
 */
export function isGameDocument(obj: any): obj is GameDocument {
	return (
		obj &&
		(obj.away === null || obj.away) &&
		typeof obj.awayScore === 'number' &&
		obj.date &&
		typeof obj.field === 'number' &&
		(obj.home === null || obj.home) &&
		typeof obj.homeScore === 'number' &&
		obj.season &&
		Object.values(GameType).includes(obj.type)
	)
}

/**
 * Type guard to check if an object is WaiverDocument
 */
export function isWaiverDocument(obj: any): obj is WaiverDocument {
	return obj && obj.player && typeof obj.signatureRequestId === 'string'
}

/**
 * Type guard to check if an object is CheckoutSessionDocument
 */
export function isCheckoutSessionDocument(
	obj: any
): obj is CheckoutSessionDocument {
	return (
		obj &&
		typeof obj.cancel_url === 'string' &&
		typeof obj.client === 'string' &&
		obj.created &&
		typeof obj.mode === 'string' &&
		typeof obj.price === 'string' &&
		typeof obj.sessionId === 'string' &&
		typeof obj.success_url === 'string' &&
		typeof obj.url === 'string'
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
