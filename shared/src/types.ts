/**
 * Shared TypeScript types and interfaces for Minneapolis Winter League
 *
 * This module contains all the common data types used across both the frontend (App)
 * and backend (Functions) of the Minneapolis Winter League application.
 *
 * These types ensure consistency between client and server code and provide
 * strong typing for Firebase Firestore document structures.
 */

// Type definitions compatible with both firebase-admin and firebase client SDKs
export type DocumentData = { [field: string]: unknown }
export type DocumentReference<_T = DocumentData, _U = DocumentData> = {
	id: string
	path: string
}
export type Timestamp = {
	seconds: number
	nanoseconds: number
}

/////////////////////////////////////////////////////////////////
/////////////////////////// Enums //////////////////////////////
/////////////////////////////////////////////////////////////////

export enum Collections {
	PLAYERS = 'players',
	OFFERS = 'offers',
	GAMES = 'games',
	TEAMS = 'teams',
	SEASONS = 'seasons',
	WAIVERS = 'waivers',
}

export enum OfferCreator {
	CAPTAIN = 'captain',
	NONCAPTAIN = 'noncaptain',
}

export enum OfferStatus {
	PENDING = 'pending',
	ACCEPTED = 'accepted',
	REJECTED = 'rejected',
}

export enum OfferType {
	OUTGOING_INVITE = 'outgoingInvite',
	OUTGOING_REQUEST = 'outgoingRequest',
	INCOMING_INVITE = 'incomingInvite',
	INCOMING_REQUEST = 'incomingRequest',
}

/////////////////////////////////////////////////////////////////
//////////////////////// Core Data Types ///////////////////////
/////////////////////////////////////////////////////////////////

/**
 * Player data structure representing a user in the system
 */
export interface PlayerData extends DocumentData {
	/** Whether the player has admin privileges */
	admin: boolean
	/** Player's email address */
	email: string
	/** Player's first name */
	firstname: string
	/** Player's last name */
	lastname: string
	/** Array of season participation data */
	seasons: PlayerSeasonData[]
}

/**
 * Player's participation data for a specific season
 */
export interface PlayerSeasonData {
	/** Whether the player is banned from the season */
	banned?: boolean
	/** Whether the player is a team captain */
	captain: boolean
	/** Whether the player has paid for the season */
	paid: boolean
	/** Reference to the season document */
	season: DocumentReference<SeasonData, DocumentData>
	/** Whether the player has signed the waiver */
	signed: boolean
	/** Reference to the team document (null if not on a team) */
	team: DocumentReference<TeamData, DocumentData> | null
}

/**
 * Team data structure
 */
export interface TeamData extends DocumentData {
	/** URL or path to team logo (nullable) */
	logo: string | null
	/** Team name */
	name: string
	/** Team's final placement/ranking (nullable if season incomplete) */
	placement: number | null
	/** Whether the team meets registration requirements */
	registered: boolean
	/** Timestamp when team became registered */
	registeredDate: Timestamp
	/** Array of team roster entries */
	roster: TeamRosterEntry[]
	/** Reference to the season document */
	season: DocumentReference<SeasonData, DocumentData>
	/** Storage path for team-related files (nullable) */
	storagePath: string | null
	/** Unique team identifier */
	teamId: string
}

/**
 * Individual entry in a team's roster
 */
export interface TeamRosterEntry {
	/** Whether this player is a team captain */
	captain: boolean
	/** Reference to the player document */
	player: DocumentReference<PlayerData, DocumentData>
}

/**
 * Season data structure
 */
export interface SeasonData extends DocumentData {
	/** Season end date */
	dateEnd: Timestamp
	/** Season start date */
	dateStart: Timestamp
	/** Season name/title */
	name: string
	/** Registration deadline */
	registrationEnd: Timestamp
	/** Registration opening date */
	registrationStart: Timestamp
	/** Array of team references participating in this season */
	teams: DocumentReference<TeamData, DocumentData>[]
}

/**
 * Offer/invitation data structure
 */
export interface OfferData extends DocumentData {
	/** Who created the offer (captain or non-captain) */
	creator: OfferCreator
	/** Display name of the offer creator */
	creatorName: string
	/** Reference to the player being invited/requested */
	player: DocumentReference<PlayerData, DocumentData>
	/** Current status of the offer */
	status: OfferStatus
	/** Reference to the team making/receiving the offer */
	team: DocumentReference<TeamData, DocumentData>
}

/**
 * Extended offer data with resolved names for display purposes
 */
export interface ExtendedOfferData extends OfferData {
	/** Resolved player name for display */
	playerName: string
	/** Resolved team name for display */
	teamName: string
}

/**
 * Game data structure
 */
export interface GameData extends DocumentData {
	/** Reference to the away team */
	away: DocumentReference<TeamData, DocumentData>
	/** Away team's score */
	awayScore: number
	/** Game date and time */
	date: Timestamp
	/** Field number where game is played */
	field: number
	/** Reference to the home team */
	home: DocumentReference<TeamData, DocumentData>
	/** Home team's score */
	homeScore: number
	/** Reference to the season this game belongs to */
	season: DocumentReference<SeasonData, DocumentData>
}

/**
 * Waiver data structure
 */
export interface WaiverData extends DocumentData {
	/** Reference to the player who signed the waiver */
	player: DocumentReference<PlayerData, DocumentData>
	/** Dropbox Sign signature request ID (optional) */
	signatureRequestId?: string
}

/**
 * Team standings data structure
 */
export interface StandingsData extends DocumentData {
	/** Number of wins */
	wins: number
	/** Number of losses */
	losses: number
	/** Total points scored */
	pointsFor: number
	/** Total points allowed */
	pointsAgainst: number
	/** Point differential (pointsFor - pointsAgainst) */
	differential: number
}

/**
 * Stripe checkout session data structure
 */
export interface CheckoutSessionData extends DocumentData {
	/** URL to redirect to on cancellation */
	cancel_url: string
	/** Error information if session creation failed */
	error: { message: string }
	/** Client identifier */
	client: string
	/** Session creation timestamp */
	created: Timestamp
	/** Checkout session mode */
	mode: string
	/** Price identifier */
	price: string
	/** Stripe session ID */
	sessionId: string
	/** URL to redirect to on success */
	success_url: string
	/** Checkout session URL */
	url: string
}

/////////////////////////////////////////////////////////////////
/////////////////////// Dropbox Sign Types ////////////////////
/////////////////////////////////////////////////////////////////

/**
 * Successful Dropbox Sign API response
 */
export interface DropboxResult {
	result: {
		signatureRequestId: string
		signingUrl: string
		requesterEmailAddress: string
	}
}

/**
 * Dropbox Sign API error response
 */
export interface DropboxError {
	error: {
		message: string
		name: string
		statusCode: number
		statusText: string
	}
}

/////////////////////////////////////////////////////////////////
//////////////////////// Utility Types //////////////////////////
/////////////////////////////////////////////////////////////////

/**
 * Generic action type for handling user interactions
 */
export interface OfferAction {
	type: 'accept' | 'reject' | 'create' | 'cancel'
	offerId?: string
	teamId?: string
	playerId?: string
}

/**
 * Notification card item properties
 */
export interface NotificationCardItemProps {
	title: string
	description: string
	timestamp: Timestamp
	type: 'info' | 'success' | 'warning' | 'error'
	action?: OfferAction
}

/////////////////////////////////////////////////////////////////
///////////////////////// Constants /////////////////////////////
/////////////////////////////////////////////////////////////////

/**
 * Firebase collection names
 */
export const COLLECTIONS = {
	SEASONS: 'seasons',
	WAIVERS: 'waivers',
	OFFERS: 'offers',
	PLAYERS: 'players',
	TEAMS: 'teams',
	GAMES: 'games',
} as const

/**
 * Common field names used in Firestore queries
 */
export const FIELDS = {
	PLAYER: 'player',
	TEAM: 'team',
	PAID: 'paid',
	SIGNED: 'signed',
	SIGNATUREREQUESTID: 'signatureRequestId',
	SEASON: 'season',
} as const

/**
 * Firebase Functions region
 */
export const REGION = 'us-central1' as const
