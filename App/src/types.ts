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
////////////////////////// Constants ////////////////////////////
/////////////////////////////////////////////////////////////////

/**
 * Precision multiplier for rating comparison
 * Used to avoid floating point issues when checking for ties in rankings
 * Note: This value must match RATING_PRECISION_MULTIPLIER in Functions/src/services/playerRankings/constants.ts
 */
export const RATING_PRECISION_MULTIPLIER = 1000000

/////////////////////////////////////////////////////////////////
/////////////////////////// Enums ///////////////////////////////
/////////////////////////////////////////////////////////////////

export enum Collections {
	BADGES = 'badges',
	/**
	 * `dropbox/{uid}/waivers` — records of waivers signed through Dropbox Sign
	 * before September 2026. Kept, read-only, as history; nothing writes them.
	 * Current signatures are `players/{uid}/waiverSignatures`.
	 */
	DROPBOX = 'dropbox',
	GAMES = 'games',
	POSTS = 'posts',
	NEWS = 'news',
	OFFERS = 'offers',
	/**
	 * `playerContacts/{uid}` — a player's email address. Private to that
	 * player and admins, which is why it is not on the public player document.
	 */
	PLAYER_CONTACTS = 'playerContacts',
	PLAYERS = 'players',
	RANKINGS = 'rankings',
	RANKINGS_HISTORY = 'rankings-history',
	RANKINGS_CALCULATIONS = 'rankings-calculations',
	// RANKINGS_CALCULATED_ROUNDS removed - incremental updates deprecated in favor of full rebuilds
	SEASONS = 'seasons',
	SITE_SETTINGS = 'siteSettings',
	STRIPE = 'stripe',
	TEAMS = 'teams',
}

/**
 * Subcollection name for per-player per-season state, living under
 * `players/{uid}/playerSeasons/{seasonId}`. Renamed from `seasons` to
 * disambiguate `collectionGroup()` queries from the team-side subcollection.
 */
export const PLAYER_SEASONS_SUBCOLLECTION = 'playerSeasons'

/**
 * Subcollection name for a player's waiver signatures, living under
 * `players/{uid}/waiverSignatures/{signatureId}`. Private to that player and
 * admins, unlike the player document itself, which anyone can read.
 */
export const WAIVER_SIGNATURES_SUBCOLLECTION = 'waiverSignatures'

/**
 * Subcollection name for per-team per-season state, living under
 * `teams/{teamId}/teamSeasons/{seasonId}`. Renamed from `seasons` to
 * disambiguate `collectionGroup()` queries from the player-side subcollection.
 */
export const TEAM_SEASONS_SUBCOLLECTION = 'teamSeasons'

/**
 * Available theme variants for the site
 * Add new themes here - they will automatically appear in the admin settings
 */
export const THEME_VARIANTS = ['default', 'valentine'] as const
export type ThemeVariant = (typeof THEME_VARIANTS)[number]

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

/**
 * Season format type
 * - traditional: Standard win/loss standings sorted by wins, then point differential
 * - swiss: Swiss-style tournament with rankings based on Wins × 2 + Buchholz score
 */
export enum SeasonFormat {
	TRADITIONAL = 'traditional',
	SWISS = 'swiss',
}

/////////////////////////////////////////////////////////////////
//////////////////////// Firestore Document Types ///////////////
/////////////////////////////////////////////////////////////////

/**
 * Player document structure representing a user in the system.
 *
 * Player season participation lives in the `players/{uid}/playerSeasons/{seasonId}`
 * subcollection (see PlayerSeasonDocument). The legacy `seasons[]` array on
 * the player document was removed in the 2026 data model migration.
 *
 * Anyone can read this document, so it holds nothing private: the player's
 * email is in `playerContacts/{uid}` (see PlayerContactDocument).
 */
export interface PlayerDocument extends DocumentData {
	/** Whether the player has admin privileges */
	admin: boolean
	/** Player's first name */
	firstname: string
	/** Player's last name */
	lastname: string
	/**
	 * Whether the player is banned from the league.
	 *
	 * A ban is a fact about a person, not about a season. It lived on the
	 * per-season subdoc until 2026, but every path that created a new subdoc
	 * — `createSeason`, `createTeam`, `rolloverTeam` — copied it forward from
	 * any previously banned season, so it already behaved as an account-level
	 * flag. It just could not be lifted: clearing one season left the others
	 * set, and the next carry-forward re-applied it.
	 */
	banned: boolean
}

/**
 * A player's contact details, at `playerContacts/{uid}`: readable only by
 * that player and admins. Written by `createPlayer`, changed by
 * `updatePlayerAdmin`, and deleted with the account.
 */
export interface PlayerContactDocument extends DocumentData {
	/** The sign-in email, lowercased; kept in step with Firebase Auth. */
	email: string
}

/**
 * Player's per-season participation document.
 *
 * Stored at `players/{uid}/playerSeasons/{seasonId}`. The doc id matches the season
 * document's id, so there is at most one doc per (player, season) pair.
 *
 * Captain status, payment status, waiver status, and ban status all live here
 * (single source of truth). The team's roster subcollection contains only the
 * membership join, never status fields.
 */
export interface PlayerSeasonDocument extends DocumentData {
	/** Reference to the season this entry corresponds to */
	season: DocumentReference<SeasonDocument>
	/**
	 * Reference to the canonical team this player belongs to (null if not
	 * on a team).
	 *
	 * **DENORMALIZED**: this field encodes the same player↔team relationship
	 * as the corresponding `teams/{teamId}/teamSeasons/{seasonId}/roster/{uid}`
	 * roster entry (see `TeamRosterDocument`). Both directions are needed
	 * because Firestore has no joins and both reads are hot paths. The App
	 * never writes either side directly — all membership changes flow
	 * through Functions callables (`updateTeamRoster`, `updateTeamAdmin`,
	 * `updatePlayerAdmin`) and triggers (`offerUpdated`), which use the
	 * `shared/membership.ts` helpers to write both sides atomically.
	 */
	team: DocumentReference<TeamDocument> | null
	/** Whether the player has paid for the season */
	paid: boolean
	/** Whether the player has signed the waiver */
	signed: boolean
	/**
	 * Whether the player is a team captain for this season.
	 *
	 * Single source of truth — the team-side roster doc carries no captain
	 * field. Updated via the Functions callables; the App never writes this
	 * directly.
	 */
	captain: boolean
}

/**
 * Canonical team document structure. One document per real team, persistent
 * across seasons.
 *
 * Per-season state lives in the `teams/{teamId}/teamSeasons/{seasonId}` subcollection
 * (see TeamSeasonDocument). The roster lives in
 * `teams/{teamId}/teamSeasons/{seasonId}/roster/{playerId}` (see TeamRosterDocument).
 * Badges live in `teams/{teamId}/badges/{badgeId}` and span the team's entire
 * history (see TeamBadgeDocument).
 */
export interface TeamDocument extends DocumentData {
	/** Timestamp when the team was first created */
	createdAt: Timestamp
	/** Reference to the player who founded the team (null if unknown) */
	createdBy: DocumentReference<PlayerDocument> | null
}

/**
 * Per-season participation document for a team.
 *
 * Stored at `teams/{teamId}/teamSeasons/{seasonId}`. Holds all per-season state
 * (name, logo, registration status, placement). Subdoc id matches the season's
 * doc id so there is at most one entry per (team, season) pair.
 */
export interface TeamSeasonDocument extends DocumentData {
	/** Reference to the season this entry corresponds to */
	season: DocumentReference<SeasonDocument>
	/** Team display name for this specific season (snapshot, may change between seasons) */
	name: string
	/** URL or path to team logo for this season (nullable) */
	logo: string | null
	/** Storage path for the season's logo file (nullable) */
	storagePath: string | null
	/** Whether the team meets registration requirements for this season */
	registered: boolean
	/** Timestamp when the team became registered for this season (null if not yet) */
	registeredDate: Timestamp | null
	/** Team's final placement for this season (nullable if incomplete) */
	placement: number | null
	/** Initial seed for Swiss-format seasons (nullable) */
	swissSeed?: number | null
}

/**
 * Single roster entry: pure membership join between team-season and player.
 *
 * Stored at `teams/{teamId}/teamSeasons/{seasonId}/roster/{playerId}`. The
 * doc id is the player's UID. Carries no status fields —
 * captain, paid and signed live on the player's season subdoc, and a ban on
 * the player document.
 *
 * **DENORMALIZED**: this entry encodes the same player↔team relationship as
 * `players/{uid}/playerSeasons/{seasonId}.team` (see `PlayerSeasonDocument`).
 * Both directions are needed because Firestore has no joins and both reads
 * are hot paths. The App never writes either side directly — all membership
 * changes flow through Functions callables which use the
 * `shared/membership.ts` helpers to write both sides atomically.
 */
export interface TeamRosterDocument extends DocumentData {
	/** Reference to the player document */
	player: DocumentReference<PlayerDocument>
	/** Timestamp when the player joined this team for this season */
	dateJoined: Timestamp
}

/**
 * Where a team contribution stands.
 *
 * A contribution is charged the moment the payer completes Checkout, so it
 * starts `paid`. `refunded` means all of it went back; a partial refund
 * leaves it `paid` with a smaller `amountCents`.
 */
export type ContributionStatus = 'paid' | 'refunded'

/**
 * A contribution someone is paying right now: the amount set aside for them
 * while their Checkout session is open, so a teammate cannot pay the same
 * dollars at the same time. Mirrors Functions/src/types.ts.
 */
export interface CheckoutReservation {
	player: DocumentReference<PlayerDocument>
	amountCents: number
	/** The Stripe Checkout session, once it has been created. */
	sessionId: string | null
	/** When the session closes. */
	expiresAt: Timestamp
	createdAt: Timestamp
}

/**
 * Every open reservation for a team-season, at
 * `teams/{teamId}/teamSeasons/{seasonId}/checkouts/open`. **PRIVATE** like
 * the contribution ledger.
 */
export interface OpenCheckoutsDocument extends DocumentData {
	/** By reservation id. A reservation is deleted once it has ended. */
	reservations: Record<string, CheckoutReservation>
}

/**
 * One payment toward a team's registration total.
 *
 * Stored at `teams/{teamId}/teamSeasons/{seasonId}/contributions/{paymentIntentId}`.
 * The document id is the Stripe PaymentIntent id, so a webhook delivered twice
 * updates one document rather than creating a second.
 *
 * **PRIVATE**: readable only by the team's roster for that season and by
 * admins (`firestore.rules`). There are deliberately no totals on the public
 * team-season document; sum this subcollection instead.
 */
export interface TeamContributionDocument extends DocumentData {
	/**
	 * The player who paid, on the roster when they did. If they have since
	 * left, their money no longer counts toward the team, and an unregistered
	 * team refunds it.
	 */
	player: DocumentReference<PlayerDocument>
	/**
	 * In cents: while `paid`, what the team still holds of this payment (paid
	 * less any partial refund); once `refunded`, what was paid.
	 */
	amountCents: number
	status: ContributionStatus
	/** Stripe PaymentIntent id; matches the document id. */
	paymentIntentId: string
	/**
	 * What was first paid, set when a partial refund changes `amountCents`.
	 * Absent while the two are the same.
	 */
	paidAmountCents?: number
	/** Set when an admin refunded this contribution by hand. */
	refundedBy?: DocumentReference<PlayerDocument>
	refundReason?: string
	refundedAt?: Timestamp
	createdAt: Timestamp
	updatedAt: Timestamp
}

/**
 * Stripe payment configuration for a season
 */
export interface SeasonStripeConfig {
	/** Stripe Price ID for production environment */
	priceId: string
	/** Stripe Price ID for development/test environment */
	priceIdDev?: string
	/** Coupon ID for returning player discount (production) */
	returningPlayerCouponId?: string
	/** Coupon ID for returning player discount (development) */
	returningPlayerCouponIdDev?: string
}

/**
 * Season document structure representing a season in the system.
 *
 * The `teams[]` array of team refs was removed in the 2026 data model
 * migration; the list of participating teams is now derived via a
 * `collectionGroup('teamSeasons').where('season', '==', seasonRef)` query
 * against the per-team season subcollections.
 */
export interface SeasonDocument extends DocumentData {
	/**
	 * How many teams have claimed one of this season's registration spots.
	 *
	 * The authoritative count, incremented in the same transaction that sets a
	 * team's `registered` flag. A collection-group count of registered teams
	 * cannot be read consistently inside a transaction, so this is what makes
	 * the twelve-spot limit a gate rather than a suggestion.
	 *
	 * Optional only for seasons created before it existed.
	 */
	registeredTeamCount?: number
	/**
	 * The collective amount a team must pay to register, in cents.
	 *
	 * Its presence is what selects the pricing model. Set, the season uses
	 * **team-total** pricing: a team registers on ten players who have signed
	 * their waiver plus this much paid by any of its rostered players, in
	 * any split. Absent, the season keeps the original **per-player** rule,
	 * where ten players must each individually be paid and signed.
	 *
	 * One field rather than a mode plus an amount, so the two cannot disagree.
	 * Past seasons leave it unset and go on behaving as they always did.
	 */
	teamRegistrationTotalCents?: number
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
	/** Stripe payment configuration for this season */
	stripe?: SeasonStripeConfig
	/** Season format type - defaults to 'traditional' for backward compatibility */
	format?: SeasonFormat
}

/**
 * Offer/invitation document structure
 */
export interface OfferDocument extends DocumentData {
	/** Reference to the user who created the offer */
	createdBy?: DocumentReference<PlayerDocument>
	/** Timestamp when the offer was created */
	createdAt: Timestamp
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
	/** Reason why an offer was automatically canceled (e.g., player joined another team) */
	canceledReason?: string
	/** Whether the offer has been processed by the offerUpdated trigger */
	processed?: boolean
	/** Error message if processing failed */
	processingError?: string
	/** Timestamp when processing failed */
	processingFailedAt?: Timestamp
}

/**
 * Game document structure
 */
export interface GameDocument extends DocumentData {
	/** Reference to the away team (null for placeholder games) */
	away: DocumentReference<TeamDocument> | null
	/**
	 * Away team's display name as of the time the game was played.
	 *
	 * **DENORMALIZED**: snapshot of `teams/{away.id}/teamSeasons/{season.id}.name`
	 * captured when the game was created or its team ref was updated. Storing
	 * the name on the game doc means rendering schedules, standings, and
	 * games tables doesn't require a join against the team-seasons collection
	 * group on every read. Also correctly preserves the team name even if
	 * the team is later renamed in a future season.
	 *
	 * Always written by the createGame/updateGame callables — never write
	 * to this field from the App directly. Null when `away` is null.
	 */
	awayName: string | null
	/** Away team's score (null if score not yet recorded) */
	awayScore: number | null
	/** Game date and time */
	date: Timestamp
	/** Field number where game is played */
	field: number
	/** Reference to the home team (null for placeholder games) */
	home: DocumentReference<TeamDocument> | null
	/**
	 * Home team's display name as of the time the game was played.
	 * See `awayName` doc for the denormalization invariant.
	 */
	homeName: string | null
	/** Home team's score (null if score not yet recorded) */
	homeScore: number | null
	/** Reference to the season this game belongs to */
	season: DocumentReference<SeasonDocument>
	/** Type of game: regular season or playoff */
	type: GameType
}

/**
 * One signature of the league waiver, for one season.
 *
 * Stored at `players/{uid}/waiverSignatures/{signatureId}` and written only
 * by Functions — `signWaiver` when a player signs, `updatePlayerAdmin` when
 * an admin records one (a paper waiver, say). Never edited or deleted: it is
 * the evidence of what was agreed, so a correction is a new record.
 *
 * `players/{uid}/playerSeasons/{seasonId}.signed` is what registration reads;
 * this is why it is true.
 */
export interface WaiverSignatureDocument extends DocumentData {
	/** The season this signature registers the player for. */
	seasonId: string
	/** Which text was agreed to; see `Functions/src/waiver/versions.ts`. */
	versionId: string
	/** SHA-256 of that version, so the text can be proven unchanged. */
	versionSha256: string
	/** A player signed in the app, or an admin recorded a signature. */
	method: 'player' | 'admin'
	/** Who wrote the record: the player, or the admin who recorded it. */
	recordedBy: string
	signedAt: Timestamp
	/** The participant's name on their profile when this was recorded. */
	participantName: string
	/** The typed signature: the participant, or a minor's parent or guardian. */
	signerName: string | null
	/** Whether the signer was the participant or signed for a minor. */
	signerRole: 'participant' | 'guardian' | null
	/** For a guardian: how they are related to the participant. */
	guardianRelationship: string | null
	/** `YYYY-MM-DD` */
	dateOfBirth: string | null
	mailingAddress: string | null
	emergencyContacts: { name: string; relationship: string; phone: string }[]
	/** The account's email at signing. */
	email: string | null
	/** Where the signature came from, as evidence of who made it. */
	ipAddress: string | null
	userAgent: string | null
	/** Why an admin recorded it; null for a player's own signature. */
	note: string | null
}

/**
 * News post document structure
 */
export interface NewsDocument extends DocumentData {
	/** Title of the news post */
	title: string
	/** Content/body of the news post */
	content: string
	/** Reference to the admin player who created the post */
	author: DocumentReference<PlayerDocument>
	/** Reference to the season this news post belongs to */
	season: DocumentReference<SeasonDocument>
	/** Timestamp when the post was created */
	createdAt: Timestamp
	/** Timestamp when the post was last updated */
	updatedAt: Timestamp
}

/**
 * Post document structure for the message board
 * Collection: posts
 */
export interface PostDocument extends DocumentData {
	/** Reference to the player who created the post */
	author: DocumentReference<PlayerDocument>
	/** Reference to the season this post belongs to */
	season: DocumentReference<SeasonDocument>
	/** Post content/message (10-2000 characters) */
	content: string
	/** Timestamp when the post was created */
	createdAt: Timestamp
	/** Timestamp when the post was last updated */
	updatedAt: Timestamp
	/** Count of replies (denormalized for display efficiency) */
	replyCount: number
}

/**
 * Reply document structure for post replies
 * Subcollection: posts/{postId}/replies
 */
export interface ReplyDocument extends DocumentData {
	/** Reference to the player who created the reply */
	author: DocumentReference<PlayerDocument>
	/** Reply content/message (10-1000 characters) */
	content: string
	/** Timestamp when the reply was created */
	createdAt: Timestamp
	/** Timestamp when the reply was last updated */
	updatedAt: Timestamp
}

/**
 * Badge document structure representing a badge that can be awarded to teams
 */
export interface BadgeDocument extends DocumentData {
	/** Unique badge identifier */
	badgeId: string
	/** Badge name/title */
	name: string
	/** Description of what the badge represents */
	description: string
	/** URL to the badge image */
	imageUrl: string | null
	/** Storage path for the badge image (for file management) */
	storagePath: string | null
	/** Timestamp when the badge was created */
	createdAt: Timestamp
	/** Reference to the admin player who created the badge */
	createdBy: DocumentReference<PlayerDocument>
	/** Timestamp when the badge was last updated */
	updatedAt: Timestamp
	/** Statistics about badge awards (optional for backward compatibility) */
	stats?: {
		/** Number of unique teamIds that have been awarded this badge */
		totalTeamsAwarded: number
		/** Timestamp when stats were last updated */
		lastUpdated: Timestamp
	}
}

/**
 * Team badge document representing a badge awarded to a canonical team.
 * Stored as a subcollection under `teams/{teamId}/badges/{badgeId}`. Tied to
 * the team's identity, not to a specific season instance.
 */
export interface TeamBadgeDocument extends DocumentData {
	/** Reference to the badge definition */
	badge: DocumentReference<BadgeDocument>
	/** Timestamp when the badge was awarded to the team */
	awardedAt: Timestamp
	/** Reference to the admin player who awarded the badge */
	awardedBy: DocumentReference<PlayerDocument>
	/** Season id during which this badge was earned (denormalized for filtering) */
	seasonId: string
}

/**
 * Site settings document structure for global site configuration
 * Stored at siteSettings/theme
 */
export interface SiteSettingsDocument extends DocumentData {
	/** Current theme variant for the site */
	themeVariant: ThemeVariant
}

/////////////////////////////////////////////////////////////////
/////////////////// Player Rankings Types ////////////////////////
/////////////////////////////////////////////////////////////////

/**
 * Player ranking document structure for Player Rankings
 * Uses TrueSkill algorithm - skill stored as μ (mu)
 */
export interface PlayerRankingDocument extends DocumentData {
	/** Reference to the player */
	player: DocumentReference<PlayerDocument>
	/** Player ID for easier querying and document management */
	playerId: string
	/** Player's display name (cached for performance) */
	playerName: string
	/** Current skill rating (TrueSkill μ) - higher is better */
	rating: number
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
 * Stores a snapshot of all player rankings after each round of games
 */
export interface RankingHistoryDocument extends DocumentData {
	/** Reference to the season */
	season: DocumentReference<SeasonDocument>
	/** Date of the snapshot */
	snapshotDate: Timestamp
	/** Array of player rankings at this point in time */
	rankings: TimeBasedPlayerRanking[]
	/** Round-specific metadata for game-by-game tracking */
	roundMeta: {
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
 * Uses TrueSkill μ (skill estimate) for rating
 */
export interface TimeBasedPlayerRanking {
	/** Player ID */
	playerId: string
	/** Player name (cached) */
	playerName: string
	/** Skill rating at this point (TrueSkill μ) */
	rating: number
	/** Rank position */
	rank: number
	/** Total games played up to this point */
	totalGames: number
	/** Total seasons participated in up to this point */
	totalSeasons: number
	/** Rating change since previous rating (for round-based tracking) */
	change?: number
	/** Previous rating before this snapshot (for round-based tracking) */
	previousRating?: number
}

/**
 * Rankings calculation state document
 */
export interface RankingsCalculationDocument extends DocumentData {
	/** Type of calculation (always 'fresh' - incremental was deprecated) */
	calculationType: 'fresh'
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
	}
}
