/**
 * Shared TypeScript types and interfaces for Minneapolis Winter League
 *
 * This module contains all the common data types used across both the frontend (App)
 * and backend (Functions) of the Minneapolis Winter League application.
 */

import {
	DocumentReference,
	DocumentData,
	Timestamp,
} from 'firebase-admin/firestore'

/////////////////////////////////////////////////////////////////
/////////////////////////// Enums ///////////////////////////////
/////////////////////////////////////////////////////////////////

export enum Collections {
	GAMES = 'games',
	OFFERS = 'offers',
	PLAYERS = 'players',
	SEASONS = 'seasons',
	TEAMS = 'teams',
	WAIVERS = 'waivers',
}

export enum OfferStatus {
	ACCEPTED = 'accepted',
	PENDING = 'pending',
	REJECTED = 'rejected',
}

export enum OfferType {
	INVITATION = 'invitation',
	REQUEST = 'request',
}

export enum OfferDirection {
	INCOMING_INVITE = 'incomingInvite',
	INCOMING_REQUEST = 'incomingRequest',
	OUTGOING_INVITE = 'outgoingInvite',
	OUTGOING_REQUEST = 'outgoingRequest',
}

export enum GameType {
	REGULAR = 'regular',
	PLAYOFF = 'playoff',
}

/////////////////////////////////////////////////////////////////
//////////////////////// Firestore Document Types ///////////////
/////////////////////////////////////////////////////////////////

/**
 * Player document structure representing a user in the system
 */
export interface PlayerDocument extends DocumentData {
	/** Whether the player has admin privileges */
	admin: boolean
	/** Player's email address */
	email: string
	/** Player's first name */
	firstname: string
	/** Player's last name */
	lastname: string
	/** Array of season participation data */
	seasons: PlayerSeason[]
}

/**
 * Player's participation data for a specific season
 */
export interface PlayerSeason {
	/** Whether the player is banned from the season */
	banned: boolean
	/** Whether the player is a team captain */
	captain: boolean
	/** Whether the player has paid for the season */
	paid: boolean
	/** Reference to the season document */
	season: DocumentReference<SeasonDocument, DocumentData>
	/** Whether the player has signed the waiver */
	signed: boolean
	/** Reference to the team document (null if not on a team) */
	team: DocumentReference<TeamDocument, DocumentData> | null
}

/**
 * Team document structure representing a team in the system
 */
export interface TeamDocument extends DocumentData {
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
	roster: TeamRosterPlayer[]
	/** Reference to the season document */
	season: DocumentReference<SeasonDocument, DocumentData>
	/** Storage path for team-related files (nullable) */
	storagePath: string | null
	/** Unique team identifier */
	teamId: string
}

/**
 * Individual entry in a team's roster
 */
export interface TeamRosterPlayer {
	/** Whether this player is a team captain */
	captain: boolean
	/** Reference to the player document */
	player: DocumentReference<PlayerDocument, DocumentData>
}

/**
 * Season document structure representing a season in the system
 */
export interface SeasonDocument extends DocumentData {
	/** Season end date */
	dateEnd: Timestamp
	/** Season start date */
	dateStart: Timestamp
	/** Season name/title */
	name: string
	/** Registration end date */
	registrationEnd: Timestamp
	/** Registration start date */
	registrationStart: Timestamp
	/** Array of team references participating in this season */
	teams: DocumentReference<TeamDocument, DocumentData>[]
}

/**
 * Offer/invitation document structure
 */
export interface OfferDocument extends DocumentData {
	/** Display name of the offer creator */
	creator: string
	/** Reference to the player being invited/requested */
	player: DocumentReference<PlayerDocument, DocumentData>
	/** Resolved player name for display (optional, populated by frontend) */
	playerName: string
	/** Current status of the offer */
	status: OfferStatus
	/** Reference to the team making/receiving the offer */
	team: DocumentReference<TeamDocument, DocumentData>
	/** Resolved team name for display (optional, populated by frontend) */
	teamName: string
	/** Type of offer: request or invitation */
	type: OfferType
}

/**
 * Game document structure
 */
export interface GameDocument extends DocumentData {
	/** Reference to the away team */
	away: DocumentReference<TeamDocument, DocumentData>
	/** Away team's score */
	awayScore: number
	/** Game date and time */
	date: Timestamp
	/** Field number where game is played */
	field: number
	/** Reference to the home team */
	home: DocumentReference<TeamDocument, DocumentData>
	/** Home team's score */
	homeScore: number
	/** Reference to the season this game belongs to */
	season: DocumentReference<SeasonDocument, DocumentData>
	/** Type of game: regular season or playoff */
	type: GameType
}

/**
 * Waiver document structure
 */
export interface WaiverDocument extends DocumentData {
	/** Reference to the player who signed the waiver */
	player: DocumentReference<PlayerDocument, DocumentData>
	/** Dropbox Sign signature request ID (optional) */
	signatureRequestId: string
}

/**
 * Stripe checkout session document structure
 */
export interface CheckoutSessionDocument extends DocumentData {
	/** URL to redirect to on cancellation */
	cancel_url: string
	/** Client identifier */
	client: string
	/** Session creation timestamp */
	created: Timestamp
	/** Error information if session creation failed */
	error: { message: string }
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
