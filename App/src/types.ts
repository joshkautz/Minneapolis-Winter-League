/**
 * TypeScript types and interfaces for Minneapolis Winter League App
 *
 * This module contains all the common data types used in the frontend (App)
 * of the Minneapolis Winter League application, specifically designed for
 * Firebase Client SDK compatibility.
 */

import {
	DocumentReference as ClientDocumentReference,
	DocumentData as ClientDocumentData,
	Timestamp as ClientTimestamp,
} from 'firebase/firestore'

/////////////////////////////////////////////////////////////////
//////////////////////// Firebase Types /////////////////////////
/////////////////////////////////////////////////////////////////

// Firebase Client SDK compatible types
export type DocumentData = ClientDocumentData
export type DocumentReference<T = DocumentData> = ClientDocumentReference<T>
export type Timestamp = ClientTimestamp

/////////////////////////////////////////////////////////////////
/////////////////////////// Enums ///////////////////////////////
/////////////////////////////////////////////////////////////////

export enum Collections {
	GAMES = 'games',
	OFFERS = 'offers',
	PLAYERS = 'players',
	RANKINGS = 'rankings',
	RANKINGS_HISTORY = 'rankings-history',
	RANKINGS_CALCULATIONS = 'rankings-calculations',
	RANKINGS_CALCULATED_ROUNDS = 'rankings-calculated-rounds',
	SEASONS = 'seasons',
	TEAMS = 'teams',
	WAIVERS = 'waivers',
}

export enum OfferStatus {
	ACCEPTED = 'accepted',
	CANCELED = 'canceled',
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
	season: DocumentReference<SeasonDocument>
	/** Whether the player has signed the waiver */
	signed: boolean
	/** Reference to the team document (null if not on a team) */
	team: DocumentReference<TeamDocument> | null
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
	season: DocumentReference<SeasonDocument>
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
	player: DocumentReference<PlayerDocument>
	/** Timestamp when player joined the team */
	dateJoined: Timestamp
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
	teams: DocumentReference<TeamDocument>[]
}

/**
 * Offer/invitation document structure
 */
export interface OfferDocument extends DocumentData {
	/** Reference to the user who created the offer */
	createdBy?: DocumentReference<PlayerDocument>
	/** Timestamp when the offer was created */
	createdAt: Timestamp
	/** Timestamp when the offer expires */
	expiresAt: Timestamp
	/** Reference to the player being invited/requested */
	player: DocumentReference<PlayerDocument>
	/** Timestamp when the offer was responded to (accepted/rejected) */
	respondedAt?: Timestamp
	/** Reference to the user who responded to the offer */
	respondedBy?: DocumentReference<PlayerDocument>
	/** Reference to the season this offer belongs to */
	season: DocumentReference<SeasonDocument>
	/** Current status of the offer */
	status: OfferStatus
	/** Reference to the team making/receiving the offer */
	team: DocumentReference<TeamDocument>
	/** Type of offer: request or invitation */
	type: OfferType
}

/**
 * Game document structure
 */
export interface GameDocument extends DocumentData {
	/** Reference to the away team (null for placeholder games) */
	away: DocumentReference<TeamDocument> | null
	/** Away team's score */
	awayScore: number
	/** Game date and time */
	date: Timestamp
	/** Field number where game is played */
	field: number
	/** Reference to the home team (null for placeholder games) */
	home: DocumentReference<TeamDocument> | null
	/** Home team's score */
	homeScore: number
	/** Reference to the season this game belongs to */
	season: DocumentReference<SeasonDocument>
	/** Type of game: regular season or playoff */
	type: GameType
}

/**
 * Waiver document structure
 */
export interface WaiverDocument extends DocumentData {
	/** Reference to the player who signed the waiver */
	player: DocumentReference<PlayerDocument>
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

/////////////////////////////////////////////////////////////////
/////////////////// Player Rankings Types ////////////////////////
/////////////////////////////////////////////////////////////////

/**
 * Player ranking document structure for Player Rankings
 */
export interface PlayerRankingDocument extends DocumentData {
	/** Reference to the player */
	player: DocumentReference<PlayerDocument>
	/** Player ID for easier querying and document management */
	playerId: string
	/** Player's display name (cached for performance) */
	playerName: string
	/** Current Elo rating */
	eloRating: number
	/** Total games played across all seasons */
	totalGames: number
	/** Total seasons participated in */
	totalSeasons: number
	/** Current rank position */
	rank: number
	/** Timestamp of last rating update */
	lastUpdated: Timestamp
	/** Last season the player participated in */
	lastSeasonId: string | null
	/** Rating change in the last calculation */
	lastRatingChange: number
}

/**
 * Rankings history snapshot document structure
 */
export interface RankingHistoryDocument extends DocumentData {
	/** Reference to the season */
	season: DocumentReference<SeasonDocument>
	/** Date of the snapshot */
	snapshotDate: Timestamp
	/** Array of player rankings at this point in time */
	rankings: TimeBasedPlayerRanking[]
	/** Calculation metadata */
	calculationMeta: {
		/** Total games processed up to this point */
		totalGamesProcessed: number
		/** Average rating of all active players */
		avgRating: number
		/** Number of active players */
		activePlayerCount: number
		/** Timestamp when this snapshot was calculated */
		calculatedAt: Timestamp
	}
	/** Optional round-specific metadata for game-by-game tracking */
	roundMeta?: {
		/** Unique round identifier */
		roundId: string
		/** Timestamp when this round started */
		roundStartTime: Timestamp
		/** Number of games in this round */
		gameCount: number
		/** IDs of games processed in this round */
		gameIds: string[]
		/** ID of the calculation that processed this round */
		calculationId: string
	}
}

/**
 * Individual player ranking within a time-based snapshot
 */
export interface TimeBasedPlayerRanking {
	/** Player ID */
	playerId: string
	/** Player name (cached) */
	playerName: string
	/** Elo rating at this point */
	eloRating: number
	/** Rank position */
	rank: number
	/** Total games played up to this point */
	totalGames: number
	/** Total seasons participated in up to this point */
	totalSeasons: number
	/** Rating change since previous rating (for round-based tracking) */
	change?: number
	/** Games played in this specific round (for round-based tracking) */
	gamesPlayedInRound?: number
	/** Previous rating before this snapshot (for round-based tracking) */
	previousRating?: number
}

/**
 * Rankings calculation state document
 */
export interface RankingsCalculationDocument extends DocumentData {
	/** Type of calculation (fresh rebuild or incremental update) */
	calculationType: 'fresh' | 'incremental'
	/** Current status of the calculation */
	status: 'pending' | 'running' | 'completed' | 'failed'
	/** Timestamp when calculation started */
	startedAt: Timestamp
	/** Timestamp when calculation completed */
	completedAt: Timestamp | null
	/** User who triggered the calculation */
	triggeredBy: string
	/** Current progress information */
	progress: {
		/** Current step being processed */
		currentStep: string
		/** Percentage complete (0-100) */
		percentComplete: number
		/** Current season being processed */
		currentSeason?: string
		/** Total seasons to process */
		totalSeasons: number
		/** Seasons processed so far */
		seasonsProcessed: number
	}
	/** Error information if calculation failed */
	error?: {
		/** Error message */
		message: string
		/** Stack trace */
		stack?: string
		/** Timestamp when error occurred */
		timestamp: Timestamp
	}
	/** Last successfully processed snapshot */
	lastProcessedSnapshot?: {
		seasonId: string
		timestamp: Timestamp
	}
	/** Calculation parameters used */
	parameters: {
		/** Starting season for calculation */
		startSeasonId?: string
		/** Whether to apply rating decay */
		applyDecay: boolean
		/** Season decay factor */
		seasonDecayFactor: number
		/** Playoff multiplier */
		playoffMultiplier: number
		/** K-factor for Elo calculation */
		kFactor: number
	}
}
