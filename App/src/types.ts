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
	CALCULATED_ROUNDS = 'calculated-rounds',
	GAMES = 'games',
	OFFERS = 'offers',
	PLAYERS = 'players',
	RANKINGS = 'rankings',
	RANKING_HISTORY = 'ranking-history',
	RANKING_CALCULATIONS = 'ranking-calculations',
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
	/** Display name of the offer creator */
	creator: string
	/** Reference to the player being invited/requested */
	player: DocumentReference<PlayerDocument>
	/** Resolved player name for display (optional, populated by frontend) */
	playerName: string
	/** Current status of the offer */
	status: OfferStatus
	/** Reference to the team making/receiving the offer */
	team: DocumentReference<TeamDocument>
	/** Resolved team name for display (optional, populated by frontend) */
	teamName: string
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
	/** Array of season-specific statistics */
	seasonStats: PlayerSeasonStats[]
	/** Rating change in the last calculation */
	lastRatingChange: number
	/** Whether the player is currently active */
	isActive: boolean
}

/**
 * Player statistics for a specific season
 */
export interface PlayerSeasonStats {
	/** Season ID */
	seasonId: string
	/** Season name (cached for performance) */
	seasonName: string
	/** Games played in this season */
	gamesPlayed: number
	/** Average point differential per game */
	avgPointDifferential: number
	/** Rating at end of season */
	endOfSeasonRating: number
	/** Team(s) played for in this season */
	teams: Array<{
		teamId: string
		teamName: string
		gamesPlayed: number
	}>
}

/**
 * Ranking history snapshot document structure
 */
export interface RankingHistoryDocument extends DocumentData {
	/** Reference to the season */
	season: DocumentReference<SeasonDocument>
	/** Week number within the season */
	week: number
	/** Date of the snapshot */
	snapshotDate: Timestamp
	/** Array of player rankings at this point in time */
	rankings: WeeklyPlayerRanking[]
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
}

/**
 * Individual player ranking within a weekly snapshot
 */
export interface WeeklyPlayerRanking {
	/** Player ID */
	playerId: string
	/** Player name (cached) */
	playerName: string
	/** Elo rating at this point */
	eloRating: number
	/** Rank position */
	rank: number
	/** Rating change since last week */
	weeklyChange: number
	/** Games played in this week */
	gamesThisWeek: number
	/** Point differential this week */
	pointDifferentialThisWeek: number
	/** Total games played up to this point */
	totalGames: number
	/** Total seasons participated in up to this point */
	totalSeasons: number
	/** Season statistics up to this point */
	seasonStats: PlayerSeasonStats[]
}

/**
 * Ranking calculation state document
 */
export interface RankingCalculationDocument extends DocumentData {
	/** Type of calculation (full, incremental, or round-based) */
	calculationType: 'full' | 'incremental' | 'round-based'
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
		/** Current week being processed */
		currentWeek?: number
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
		week: number
	}
	/** Calculation parameters used */
	parameters: {
		/** Starting season for calculation */
		startSeasonId?: string
		/** Starting week for incremental calculations */
		startWeek?: number
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
