/**
 * Firebase Firestore operations - organized by domain
 *
 * This file re-exports all Firestore functions for backward compatibility
 * and provides a single entry point for all database operations.
 */

// Player operations
export {
	getPlayerSnapshot,
	getPlayerRef,
	getPlayersQuery,
} from './collections/players'

// Player functions (Firebase Callable Functions)
export { updatePlayerViaFunction } from './collections/functions'

// Team operations
export {
	getTeamById,
	teamsQuery,
	teamsHistoryQuery,
	currentSeasonTeamsQuery,
	teamsBySeasonQuery,
} from './collections/teams'

// Offer operations (invitations and requests)
export {
	outgoingOffersQuery,
	incomingOffersQuery,
	offersForPlayerByTeamQuery,
} from './collections/offers'

// Game operations
export {
	currentSeasonRegularGamesQuery,
	currentSeasonPlayoffGamesQuery,
	currentSeasonGamesQuery,
	gamesByTeamQuery,
	allGamesQuery,
} from './collections/games'

// Season operations
export { seasonsQuery } from './collections/seasons'

// News operations
export { newsQueryBySeason, allNewsQueryBySeason } from './collections/news'

// Payment operations
export { stripeRegistration } from './collections/payments'

// Re-export Firebase types for convenience
export type { DocumentData, Timestamp } from '@/shared/utils'

// Re-export Firebase client SDK types that are still needed
export type {
	QueryDocumentSnapshot,
	DocumentSnapshot,
	Query,
	CollectionReference,
	QuerySnapshot,
	FirestoreError,
	DocumentReference,
} from 'firebase/firestore'
