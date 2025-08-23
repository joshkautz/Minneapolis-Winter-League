/**
 * Shared TypeScript types and interfaces for Minneapolis Winter League
 *
 * This module contains all the common data types used across both the frontend (App)
 * and backend (Functions) of the Minneapolis Winter League application.
 */

import { DocumentReference, DocumentData, Timestamp } from 'firebase/firestore'

/////////////////////////////////////////////////////////////////
/////////////////////////// Enums ///////////////////////////////
/////////////////////////////////////////////////////////////////

export enum Collections {
	PLAYERS = 'players',
	OFFERS = 'offers',
	GAMES = 'games',
	TEAMS = 'teams',
	SEASONS = 'seasons',
	WAIVERS = 'waivers',
}

export enum OfferStatus {
	PENDING = 'pending',
	ACCEPTED = 'accepted',
	REJECTED = 'rejected',
}

export enum OfferType {
	REQUEST = 'request',
	INVITATION = 'invitation',
}

export enum OfferDirection {
	OUTGOING_INVITE = 'outgoingInvite',
	OUTGOING_REQUEST = 'outgoingRequest',
	INCOMING_INVITE = 'incomingInvite',
	INCOMING_REQUEST = 'incomingRequest',
}

export enum GameType {
	REGULAR = 'regular',
	PLAYOFF = 'playoff',
}

/////////////////////////////////////////////////////////////////
//////////////////////// Core Data Types ////////////////////////
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
	banned: boolean
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
 * Team data structure representing a team in the system
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
 * Season data structure representing a season in the system
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
	/** Type of offer: request or invitation */
	type: OfferType
	/** Display name of the offer creator */
	creator: string
	/** Reference to the player being invited/requested */
	player: DocumentReference<PlayerData, DocumentData>
	/** Resolved player name for display (optional, populated by frontend) */
	playerName: string
	/** Current status of the offer */
	status: OfferStatus
	/** Reference to the team making/receiving the offer */
	team: DocumentReference<TeamData, DocumentData>
	/** Resolved team name for display (optional, populated by frontend) */
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
	/** Type of game: regular season or playoff */
	type: GameType
}

/**
 * Waiver data structure
 */
export interface WaiverData extends DocumentData {
	/** Reference to the player who signed the waiver */
	player: DocumentReference<PlayerData, DocumentData>
	/** Dropbox Sign signature request ID (optional) */
	signatureRequestId: string
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
