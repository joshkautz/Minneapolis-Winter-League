/**
 * Client-side wrappers for Firebase Functions
 *
 * These functions provide a clean interface to call Firebase Functions
 * from the client-side application, replacing the complex client-side
 * Firestore operations.
 */

import { httpsCallable } from 'firebase/functions'
import { functions } from '../app'
import type {
	CreatePlayerRequest,
	CreatePlayerResponse,
	UpdatePlayerRequest,
	UpdatePlayerResponse,
	DeletePlayerRequest,
	DeletePlayerResponse,
} from './player-types'

/**
 * Creates a new player profile via Firebase Function
 * Replaces the complex client-side createPlayer function
 *
 * This function ensures all security validations are performed server-side:
 * - Authentication verification
 * - Email matching
 * - Document ID matches user UID
 * - Admin field set to false
 * - All required fields validated
 *
 * @throws Error when validation fails or Firebase function execution fails
 */
export const createPlayerViaFunction = async (
	data: CreatePlayerRequest
): Promise<CreatePlayerResponse> => {
	const createPlayer = httpsCallable<CreatePlayerRequest, CreatePlayerResponse>(
		functions,
		'createPlayer'
	)

	const result = await createPlayer(data)
	return result.data
}

/**
 * Updates a player profile via Firebase Function
 *
 * Security features:
 * - Users can only update their own profile (unless admin)
 * - Only safe fields can be updated (firstname, lastname)
 * - Email and admin status cannot be changed
 * - Server-side validation of all inputs
 */
export const updatePlayerViaFunction = async (
	data: UpdatePlayerRequest
): Promise<UpdatePlayerResponse> => {
	const updatePlayer = httpsCallable<UpdatePlayerRequest, UpdatePlayerResponse>(
		functions,
		'updatePlayer'
	)
	const result = await updatePlayer(data)
	return result.data
}

/**
 * Deletes a player profile via Firebase Function
 *
 * Security features:
 * - Users can only delete their own profile (unless admin)
 * - Admins can delete any player with adminOverride flag
 * - Checks for team associations before deletion
 * - Provides audit logging and warnings
 */
export const deletePlayerViaFunction = async (
	data: DeletePlayerRequest = {}
): Promise<DeletePlayerResponse> => {
	const deletePlayer = httpsCallable<DeletePlayerRequest, DeletePlayerResponse>(
		functions,
		'deletePlayer'
	)
	const result = await deletePlayer(data)
	return result.data
}

interface UpdatePlayerEmailRequest {
	/** User ID whose email should be updated */
	playerId: string
	/** New email address */
	newEmail: string
}

interface UpdatePlayerEmailResponse {
	success: true
	playerId: string
	newEmail: string
	message: string
}

/**
 * Updates a player's email address via Firebase Function
 *
 * Security features:
 * - Only admins can call this function
 * - Validates email format and availability
 * - Updates both Firebase Authentication and Firestore
 * - Automatically marks email as verified
 * - Comprehensive error handling and logging
 */
export const updatePlayerEmailViaFunction = async (
	data: UpdatePlayerEmailRequest
): Promise<UpdatePlayerEmailResponse> => {
	const updatePlayerEmail = httpsCallable<
		UpdatePlayerEmailRequest,
		UpdatePlayerEmailResponse
	>(functions, 'updatePlayerEmail')
	const result = await updatePlayerEmail(data)
	return result.data
}

//////////////////////////////////////////////////////////////////////////////
// UPDATE PLAYER (Admin)
//////////////////////////////////////////////////////////////////////////////

/**
 * Season update data for a specific season
 */
interface SeasonUpdateData {
	/** Season document ID */
	seasonId: string
	/** Whether the player is a team captain */
	captain: boolean
	/** Whether the player has paid for the season */
	paid: boolean
	/** Whether the player has signed the waiver */
	signed: boolean
	/** Whether the player is banned from the season (optional, defaults to false) */
	banned?: boolean
	/** Whether the player is looking for a team (optional, defaults to false) */
	lookingForTeam?: boolean
	/** Team document ID (null if not on a team) */
	teamId: string | null
}

interface UpdatePlayerAdminRequest {
	/** Player's Firebase Auth UID */
	playerId: string
	/** Player's first name (optional) */
	firstname?: string
	/** Player's last name (optional) */
	lastname?: string
	/** Admin status (optional) */
	admin?: boolean
	/** Email address (optional, will sync with Firebase Auth) */
	email?: string
	/** Email verification status (optional, will update Firebase Auth) */
	emailVerified?: boolean
	/** Season updates (optional) */
	seasons?: SeasonUpdateData[]
}

/**
 * Details about what changed in a season
 */
interface SeasonChanges {
	seasonId: string
	seasonName?: string
	updated?: boolean
	changes?: {
		captain?: { from: boolean; to: boolean }
		paid?: { from: boolean; to: boolean }
		signed?: { from: boolean; to: boolean }
		banned?: { from: boolean; to: boolean }
		lookingForTeam?: { from: boolean; to: boolean }
		team?: { from: string | null; to: string | null }
	}
}

interface UpdatePlayerAdminResponse {
	success: true
	playerId: string
	message: string
	/** Detailed changes made to the player document */
	changes: {
		/** Whether and how firstname was updated */
		firstname?: { from: string; to: string }
		/** Whether and how lastname was updated */
		lastname?: { from: string; to: string }
		/** Whether and how email was updated */
		email?: { from: string; to: string }
		/** Whether and how admin status was updated */
		admin?: { from: boolean; to: boolean }
		/** Whether and how email verification status was updated */
		emailVerified?: { from: boolean; to: boolean }
		/** Details about season changes */
		seasons?: SeasonChanges[]
	}
}

/**
 * Updates a player's document via Firebase Function (admin only)
 *
 * Security features:
 * - Only admins can call this function
 * - Can update basic info, admin status, and season data
 * - Email updates automatically sync with Firebase Authentication
 * - Comprehensive validation and error handling
 */
export const updatePlayerAdminViaFunction = async (
	data: UpdatePlayerAdminRequest
): Promise<UpdatePlayerAdminResponse> => {
	const updatePlayerAdmin = httpsCallable<
		UpdatePlayerAdminRequest,
		UpdatePlayerAdminResponse
	>(functions, 'updatePlayerAdmin')
	const result = await updatePlayerAdmin(data)
	return result.data
}

//////////////////////////////////////////////////////////////////////////////
// GET PLAYER AUTH INFO (Admin)
//////////////////////////////////////////////////////////////////////////////

interface GetPlayerAuthInfoRequest {
	/** Player's Firebase Auth UID */
	playerId: string
}

interface GetPlayerAuthInfoResponse {
	success: true
	playerId: string
	/** Whether the user's email is verified */
	emailVerified: boolean
	/** The user's email address from Firebase Auth */
	email: string | undefined
}

/**
 * Gets Firebase Authentication info for a player (admin only)
 *
 * Returns the player's Firebase Auth info including email verification status.
 * This is needed because emailVerified is stored in Firebase Auth, not Firestore.
 */
export const getPlayerAuthInfoViaFunction = async (
	data: GetPlayerAuthInfoRequest
): Promise<GetPlayerAuthInfoResponse> => {
	const getPlayerAuthInfo = httpsCallable<
		GetPlayerAuthInfoRequest,
		GetPlayerAuthInfoResponse
	>(functions, 'getPlayerAuthInfo')
	const result = await getPlayerAuthInfo(data)
	return result.data
}

//////////////////////////////////////////////////////////////////////////////
// DELETE UNREGISTERED TEAM (Admin)
//////////////////////////////////////////////////////////////////////////////

/**
 * Request interface for deleting an unregistered team
 */
interface DeleteUnregisteredTeamRequest {
	/** The team ID to delete */
	teamId: string
}

/**
 * Response interface for deleting an unregistered team
 */
interface DeleteUnregisteredTeamResponse {
	success: boolean
	message: string
	/** ID of the deleted team */
	teamId: string
	/** Name of the deleted team */
	teamName: string
	/** Number of players removed from the team */
	playersRemoved: number
}

/**
 * Deletes an unregistered team via Firebase Function (Admin only)
 * Only callable by admin users via the Admin Dashboard
 * Team must be unregistered and belong to the current season
 */
export const deleteUnregisteredTeamViaFunction = async (
	data: DeleteUnregisteredTeamRequest
): Promise<DeleteUnregisteredTeamResponse> => {
	const deleteUnregisteredTeam = httpsCallable<
		DeleteUnregisteredTeamRequest,
		DeleteUnregisteredTeamResponse
	>(functions, 'deleteUnregisteredTeam')
	const result = await deleteUnregisteredTeam(data)
	return result.data
}

//////////////////////////////////////////////////////////////////////////////
// UPDATE TEAM (Admin)
//////////////////////////////////////////////////////////////////////////////

/**
 * Player to add to roster
 */
interface AddPlayerToRosterRequest {
	/** Player's Firebase Auth UID */
	playerId: string
	/** Whether the player should be a captain */
	captain: boolean
}

/**
 * Captain status update request
 */
interface CaptainStatusUpdateRequest {
	/** Player's Firebase Auth UID */
	playerId: string
	/** New captain status */
	captain: boolean
}

/**
 * Roster changes request
 */
interface RosterChangesRequest {
	/** Players to add to roster */
	addPlayers?: AddPlayerToRosterRequest[]
	/** Player IDs to remove from roster */
	removePlayers?: string[]
	/** Players to update captain status */
	updateCaptainStatus?: CaptainStatusUpdateRequest[]
}

/**
 * Request interface for updating a team (admin)
 */
interface UpdateTeamAdminRequest {
	/** Team's Firestore document ID */
	teamDocId: string
	/** New team name (optional) */
	name?: string
	/** New teamId to link this team with another team's history (optional) */
	linkToTeamId?: string
	/** Roster changes (optional) */
	rosterChanges?: RosterChangesRequest
}

/**
 * Response interface for updating a team (admin)
 */
interface UpdateTeamAdminResponse {
	success: true
	teamDocId: string
	message: string
	changes: {
		name?: { from: string; to: string }
		teamId?: { from: string; to: string }
		rosterAdded?: string[]
		rosterRemoved?: string[]
		captainChanges?: { playerId: string; from: boolean; to: boolean }[]
	}
}

/**
 * Updates a team via Firebase Function (Admin only)
 * Supports: name changes, team linking (teamId), roster management
 */
export const updateTeamAdminViaFunction = async (
	data: UpdateTeamAdminRequest
): Promise<UpdateTeamAdminResponse> => {
	const updateTeamAdmin = httpsCallable<
		UpdateTeamAdminRequest,
		UpdateTeamAdminResponse
	>(functions, 'updateTeamAdmin')
	const result = await updateTeamAdmin(data)
	return result.data
}

//////////////////////////////////////////////////////////////////////////////
// TEAM FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

interface CreateTeamRequest {
	name: string
	logoBlob?: string // Base64 encoded image
	logoContentType?: string // MIME type of the image
	seasonId: string
	timezone?: string // User's browser timezone
}

interface CreateTeamResponse {
	teamId: string
	success: boolean
	message: string
}

/**
 * Creates a new team via Firebase Function with optional logo upload
 * Handles server-side file upload and team creation
 */
export const createTeamViaFunction = async (
	data: CreateTeamRequest
): Promise<CreateTeamResponse> => {
	const createTeam = httpsCallable<CreateTeamRequest, CreateTeamResponse>(
		functions,
		'createTeam'
	)
	const result = await createTeam(data)
	return result.data
}

interface RolloverTeamRequest {
	originalTeamId: string
	seasonId: string
	timezone?: string // User's browser timezone
}

interface RolloverTeamResponse {
	success: boolean
	teamId: string
	message: string
}

/**
 * Rolls over an existing team to the current season
 * Creates new team document while preserving teamId
 */
export const rolloverTeamViaFunction = async (
	data: RolloverTeamRequest
): Promise<RolloverTeamResponse> => {
	const rolloverTeam = httpsCallable<RolloverTeamRequest, RolloverTeamResponse>(
		functions,
		'rolloverTeam'
	)
	const result = await rolloverTeam(data)
	return result.data
}

interface DeleteTeamRequest {
	teamId: string
}

interface DeleteTeamResponse {
	success: boolean
}

/**
 * Deletes a team via Firebase Function
 * Replaces the complex client-side deleteTeam function
 */
export const deleteTeamViaFunction = async (
	teamId: string
): Promise<DeleteTeamResponse> => {
	const deleteTeam = httpsCallable<DeleteTeamRequest, DeleteTeamResponse>(
		functions,
		'deleteTeam'
	)
	const result = await deleteTeam({ teamId })
	return result.data
}

interface ManageTeamPlayerRequest {
	teamId: string
	playerId: string
	action: 'promote' | 'demote' | 'remove'
}

interface UpdateTeamRosterResponse {
	success: boolean
	message: string
	teamId: string
	playerId: string
}

/**
 * Updates team roster (promote/demote/remove) via Firebase Function
 * Replaces promoteToCaptain, demoteFromCaptain, removeFromTeam functions
 */
export const updateTeamRosterViaFunction = async (
	data: ManageTeamPlayerRequest
): Promise<UpdateTeamRosterResponse> => {
	const updateTeamRoster = httpsCallable<
		ManageTeamPlayerRequest,
		UpdateTeamRosterResponse
	>(functions, 'updateTeamRoster')
	const result = await updateTeamRoster(data)
	return result.data
}

interface EditTeamRequest {
	teamId: string
	name?: string
	logo?: string
	storagePath?: string
	logoBlob?: string // Base64 encoded image
	logoContentType?: string // MIME type of the image
}

interface EditTeamResponse {
	success: boolean
	message: string
	teamId: string
}

/**
 * Edits team information via Firebase Function
 * Replaces the client-side editTeam function
 */
export const editTeamViaFunction = async (
	data: EditTeamRequest
): Promise<EditTeamResponse> => {
	const updateTeam = httpsCallable<EditTeamRequest, EditTeamResponse>(
		functions,
		'updateTeam'
	)
	const result = await updateTeam(data)
	return result.data
}

//////////////////////////////////////////////////////////////////////////////
// OFFER FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

interface CreateOfferRequest {
	playerId: string
	teamId: string
	type: 'invitation' | 'request'
}

interface CreateOfferResponse {
	offerId: string
	success: boolean
}

/**
 * Creates an offer (invitation or request) via Firebase Function
 * Replaces invitePlayer and requestToJoinTeam functions
 */
export const createOfferViaFunction = async (
	data: CreateOfferRequest
): Promise<CreateOfferResponse> => {
	const createOffer = httpsCallable<CreateOfferRequest, CreateOfferResponse>(
		functions,
		'createOffer'
	)
	const result = await createOffer(data)
	return result.data
}

interface UpdateOfferRequest {
	offerId: string
	status: 'accepted' | 'rejected' | 'canceled'
}

interface UpdateOfferResponse {
	success: boolean
	message: string
	offerId: string
}

/**
 * Updates an offer (accept/reject/cancel) via Firebase Function
 * Replaces acceptOffer and rejectOffer functions
 */
export const updateOfferViaFunction = async (
	data: UpdateOfferRequest
): Promise<UpdateOfferResponse> => {
	const updateOffer = httpsCallable<UpdateOfferRequest, UpdateOfferResponse>(
		functions,
		'updateOffer'
	)
	const result = await updateOffer(data)
	return result.data
}

//////////////////////////////////////////////////////////////////////////////
// GAME MANAGEMENT FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

/**
 * Create a new game via Firebase Function
 *
 * @param data Game creation parameters
 * @returns Success response with game ID
 */
export const createGameViaFunction = async (data: {
	homeTeamId: string | null
	awayTeamId: string | null
	homeScore: number | null
	awayScore: number | null
	field: number
	type: 'regular' | 'playoff'
	timestamp: string
	seasonId: string
}): Promise<{ success: true; gameId: string; message: string }> => {
	const createGame = httpsCallable(functions, 'createGame')
	const result = await createGame(data)
	return result.data as { success: true; gameId: string; message: string }
}

/**
 * Update an existing game via Firebase Function
 *
 * @param data Game update parameters
 * @returns Success response
 */
export const updateGameViaFunction = async (data: {
	gameId: string
	homeTeamId?: string | null
	awayTeamId?: string | null
	homeScore?: number | null
	awayScore?: number | null
	field?: number
	type?: 'regular' | 'playoff'
	timestamp?: string
	seasonId?: string
}): Promise<{ success: true; gameId: string; message: string }> => {
	const updateGame = httpsCallable(functions, 'updateGame')
	const result = await updateGame(data)
	return result.data as { success: true; gameId: string; message: string }
}

/**
 * Delete a game via Firebase Function
 *
 * @param data Game deletion parameters
 * @returns Success response
 */
export const deleteGameViaFunction = async (data: {
	gameId: string
}): Promise<{ success: true; gameId: string; message: string }> => {
	const deleteGame = httpsCallable(functions, 'deleteGame')
	const result = await deleteGame(data)
	return result.data as { success: true; gameId: string; message: string }
}

//////////////////////////////////////////////////////////////////////////////
// NEWS MANAGEMENT FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

interface CreateNewsRequest {
	title: string
	content: string
	seasonId: string
}

interface CreateNewsResponse {
	success: true
	newsId: string
	message: string
}

/**
 * Create a new news post via Firebase Function (admin only)
 *
 * Security features:
 * - Only admins can create news posts
 * - Title and content are validated server-side
 * - Season must exist
 */
export const createNewsViaFunction = async (
	data: CreateNewsRequest
): Promise<CreateNewsResponse> => {
	const createNews = httpsCallable<CreateNewsRequest, CreateNewsResponse>(
		functions,
		'createNews'
	)
	const result = await createNews(data)
	return result.data
}

interface UpdateNewsRequest {
	newsId: string
	title?: string
	content?: string
	seasonId?: string
}

interface UpdateNewsResponse {
	success: true
	newsId: string
	message: string
}

/**
 * Update an existing news post via Firebase Function (admin only)
 *
 * Security features:
 * - Only admins can update news posts
 * - At least one field must be provided
 * - Title and content are validated if provided
 */
export const updateNewsViaFunction = async (
	data: UpdateNewsRequest
): Promise<UpdateNewsResponse> => {
	const updateNews = httpsCallable<UpdateNewsRequest, UpdateNewsResponse>(
		functions,
		'updateNews'
	)
	const result = await updateNews(data)
	return result.data
}

interface DeleteNewsRequest {
	newsId: string
}

interface DeleteNewsResponse {
	success: true
	newsId: string
	message: string
}

/**
 * Delete a news post via Firebase Function (admin only)
 *
 * Security features:
 * - Only admins can delete news posts
 * - News post must exist
 */
export const deleteNewsViaFunction = async (
	data: DeleteNewsRequest
): Promise<DeleteNewsResponse> => {
	const deleteNews = httpsCallable<DeleteNewsRequest, DeleteNewsResponse>(
		functions,
		'deleteNews'
	)
	const result = await deleteNews(data)
	return result.data
}

//////////////////////////////////////////////////////////////////////////////
// SEASON MANAGEMENT FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

interface CreateSeasonRequest {
	name: string
	dateStart: Date
	dateEnd: Date
	registrationStart: Date
	registrationEnd: Date
	teamIds?: string[]
	stripe?: {
		priceId: string
		priceIdDev?: string
		returningPlayerCouponId?: string
		returningPlayerCouponIdDev?: string
	}
}

interface CreateSeasonResponse {
	success: boolean
	message: string
	seasonId?: string
}

/**
 * Create a new season via Firebase Function (admin only)
 * Automatically adds the season to all existing players
 *
 * Security features:
 * - Only admins can create seasons
 * - Season name must be 3-100 characters
 * - All date fields are required
 */
export const createSeasonViaFunction = async (
	data: CreateSeasonRequest
): Promise<CreateSeasonResponse> => {
	const createSeason = httpsCallable<CreateSeasonRequest, CreateSeasonResponse>(
		functions,
		'createSeason'
	)
	const result = await createSeason(data)
	return result.data
}

interface UpdateSeasonRequest {
	seasonId: string
	name: string
	dateStart: Date
	dateEnd: Date
	registrationStart: Date
	registrationEnd: Date
	teamIds?: string[]
	stripe?: {
		priceId: string
		priceIdDev?: string
		returningPlayerCouponId?: string
		returningPlayerCouponIdDev?: string
	}
}

interface UpdateSeasonResponse {
	success: boolean
	message: string
}

/**
 * Update a season via Firebase Function (admin only)
 *
 * Security features:
 * - Only admins can update seasons
 * - Season must exist
 * - Season name must be 3-100 characters
 */
export const updateSeasonViaFunction = async (
	data: UpdateSeasonRequest
): Promise<UpdateSeasonResponse> => {
	const updateSeason = httpsCallable<UpdateSeasonRequest, UpdateSeasonResponse>(
		functions,
		'updateSeason'
	)
	const result = await updateSeason(data)
	return result.data
}

interface DeleteSeasonRequest {
	seasonId: string
}

interface DeleteSeasonResponse {
	success: boolean
	message: string
}

/**
 * Delete a season via Firebase Function (admin only)
 * Removes the season from all players' seasons arrays
 *
 * Security features:
 * - Only admins can delete seasons
 * - Season must exist
 * - Orphans references in teams, games, offers (does not cascade delete)
 */
export const deleteSeasonViaFunction = async (
	data: DeleteSeasonRequest
): Promise<DeleteSeasonResponse> => {
	const deleteSeason = httpsCallable<DeleteSeasonRequest, DeleteSeasonResponse>(
		functions,
		'deleteSeason'
	)
	const result = await deleteSeason(data)
	return result.data
}

//////////////////////////////////////////////////////////////////////////////
// BADGE MANAGEMENT FUNCTIONS (ADMIN ONLY)
//////////////////////////////////////////////////////////////////////////////

export interface CreateBadgeRequest {
	name: string
	description: string
	imageBlob?: string // Base64 encoded image
	imageContentType?: string // MIME type of the image
}

export interface CreateBadgeResponse {
	success: true
	badgeId: string
	message: string
}

/**
 * Creates a new badge via Firebase Function (admin only)
 *
 * Security features:
 * - Only admins can create badges
 * - Name and description are validated
 * - Image size limited to 5MB
 * - Image stored in Firebase Storage
 */
export const createBadgeViaFunction = async (
	data: CreateBadgeRequest
): Promise<CreateBadgeResponse> => {
	const createBadge = httpsCallable<CreateBadgeRequest, CreateBadgeResponse>(
		functions,
		'createBadge'
	)
	const result = await createBadge(data)
	return result.data
}

export interface UpdateBadgeRequest {
	badgeId: string
	name?: string
	description?: string
	imageBlob?: string // Base64 encoded image
	imageContentType?: string // MIME type of the image
	removeImage?: boolean // Flag to remove existing image
}

export interface UpdateBadgeResponse {
	success: true
	badgeId: string
	message: string
}

/**
 * Updates an existing badge via Firebase Function (admin only)
 *
 * Security features:
 * - Only admins can update badges
 * - Badge must exist
 * - Fields are validated if provided
 * - Old images are deleted when replaced or removed
 */
export const updateBadgeViaFunction = async (
	data: UpdateBadgeRequest
): Promise<UpdateBadgeResponse> => {
	const updateBadge = httpsCallable<UpdateBadgeRequest, UpdateBadgeResponse>(
		functions,
		'updateBadge'
	)
	const result = await updateBadge(data)
	return result.data
}

export interface DeleteBadgeRequest {
	badgeId: string
}

export interface DeleteBadgeResponse {
	success: true
	badgeId: string
	message: string
	teamsAffected: number
}

/**
 * Deletes a badge and removes it from all teams via Firebase Function (admin only)
 *
 * Security features:
 * - Only admins can delete badges
 * - Badge must exist
 * - Automatically removes badge from all teams that have it
 * - Deletes badge image from storage
 */
export const deleteBadgeViaFunction = async (
	data: DeleteBadgeRequest
): Promise<DeleteBadgeResponse> => {
	const deleteBadge = httpsCallable<DeleteBadgeRequest, DeleteBadgeResponse>(
		functions,
		'deleteBadge'
	)
	const result = await deleteBadge(data)
	return result.data
}

export interface AwardBadgeRequest {
	badgeId: string
	teamId: string
}

export interface AwardBadgeResponse {
	success: true
	badgeId: string
	teamId: string
	message: string
}

/**
 * Awards a badge to a specific team via Firebase Function (admin only)
 *
 * Security features:
 * - Only admins can award badges
 * - Badge and team must exist
 * - Prevents duplicate badge awards
 * - Records who awarded the badge and when
 */
export const awardBadgeViaFunction = async (
	data: AwardBadgeRequest
): Promise<AwardBadgeResponse> => {
	const awardBadge = httpsCallable<AwardBadgeRequest, AwardBadgeResponse>(
		functions,
		'awardBadge'
	)
	const result = await awardBadge(data)
	return result.data
}

export interface RevokeBadgeRequest {
	badgeId: string
	teamId: string
}

export interface RevokeBadgeResponse {
	success: true
	badgeId: string
	teamId: string
	message: string
}

/**
 * Revokes a badge from a specific team via Firebase Function (admin only)
 *
 * Security features:
 * - Only admins can revoke badges
 * - Badge and team must exist
 * - Team must have the badge to revoke it
 * - Records who revoked the badge
 */
export const revokeBadgeViaFunction = async (
	data: RevokeBadgeRequest
): Promise<RevokeBadgeResponse> => {
	const revokeBadge = httpsCallable<RevokeBadgeRequest, RevokeBadgeResponse>(
		functions,
		'revokeBadge'
	)
	const result = await revokeBadge(data)
	return result.data
}

//////////////////////////////////////////////////////////////////////////////
// WAIVER MANAGEMENT FUNCTIONS (ADMIN ONLY)
//////////////////////////////////////////////////////////////////////////////

interface SendWaiverAdminRequest {
	/** Player's Firebase Auth UID */
	playerId: string
	/** Season document ID (optional - defaults to current season) */
	seasonId?: string
}

interface SendWaiverAdminResponse {
	success: true
	playerId: string
	seasonId: string
	signatureRequestId: string
	message: string
}

/**
 * Sends a waiver signature request to a player via Firebase Function (admin only)
 *
 * This is used for cash payment scenarios where the player needs a waiver
 * but didn't go through the Stripe payment flow.
 *
 * Security features:
 * - Only admins can send waivers
 * - Player must exist and be marked as paid for the season
 * - Prevents duplicate waivers (use sendWaiverReminder instead)
 */
export const sendWaiverAdminViaFunction = async (
	data: SendWaiverAdminRequest
): Promise<SendWaiverAdminResponse> => {
	const sendWaiverAdmin = httpsCallable<
		SendWaiverAdminRequest,
		SendWaiverAdminResponse
	>(functions, 'sendWaiverAdmin')
	const result = await sendWaiverAdmin(data)
	return result.data
}

//////////////////////////////////////////////////////////////////////////////
// MIGRATION HELPERS
//////////////////////////////////////////////////////////////////////////////

/**
 * Wrapper functions to maintain backward compatibility during migration
 * These can be used as drop-in replacements for existing client-side functions
 */

export const createTeam = createTeamViaFunction
export const deleteTeam = deleteTeamViaFunction

export const promoteToCaptain = async (
	playerRef: { id: string },
	teamRef: { id: string }
) => {
	return updateTeamRosterViaFunction({
		teamId: teamRef.id,
		playerId: playerRef.id,
		action: 'promote',
	})
}

export const demoteFromCaptain = async (
	playerRef: { id: string },
	teamRef: { id: string }
) => {
	return updateTeamRosterViaFunction({
		teamId: teamRef.id,
		playerId: playerRef.id,
		action: 'demote',
	})
}

export const removeFromTeam = async (
	playerRef: { id: string },
	teamRef: { id: string }
) => {
	return updateTeamRosterViaFunction({
		teamId: teamRef.id,
		playerId: playerRef.id,
		action: 'remove',
	})
}

//////////////////////////////////////////////////////////////////////////////
// SITE SETTINGS FUNCTIONS (ADMIN ONLY)
//////////////////////////////////////////////////////////////////////////////

import type { ThemeVariant } from '@/types'

interface UpdateSiteSettingsRequest {
	themeVariant: ThemeVariant
}

interface UpdateSiteSettingsResponse {
	success: true
	themeVariant: ThemeVariant
	message: string
}

/**
 * Updates site-wide settings via Firebase Function (admin only)
 *
 * Security features:
 * - Only admins can update site settings
 * - Theme variant is validated server-side
 * - Changes affect all users immediately
 */
export const updateSiteSettingsViaFunction = async (
	data: UpdateSiteSettingsRequest
): Promise<UpdateSiteSettingsResponse> => {
	const updateSiteSettings = httpsCallable<
		UpdateSiteSettingsRequest,
		UpdateSiteSettingsResponse
	>(functions, 'updateSiteSettings')
	const result = await updateSiteSettings(data)
	return result.data
}

//////////////////////////////////////////////////////////////////////////////
// POSTS FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

export interface CreatePostRequest {
	content: string
	seasonId: string
}

export interface CreatePostResponse {
	success: true
	postId: string
	message: string
}

/**
 * Creates a post via Firebase Function
 *
 * Security features:
 * - User must be authenticated with verified email
 * - User must not be banned for the season
 * - Content is validated (10-2000 characters)
 */
export const createPostViaFunction = async (
	data: CreatePostRequest
): Promise<CreatePostResponse> => {
	const createPost = httpsCallable<CreatePostRequest, CreatePostResponse>(
		functions,
		'createPost'
	)
	const result = await createPost(data)
	return result.data
}

export interface UpdatePostRequest {
	postId: string
	content: string
}

export interface UpdatePostResponse {
	success: true
	postId: string
	message: string
}

/**
 * Updates a post via Firebase Function
 *
 * Security features:
 * - User must be authenticated with verified email
 * - User must be the author of the post
 * - Content is validated (10-2000 characters)
 */
export const updatePostViaFunction = async (
	data: UpdatePostRequest
): Promise<UpdatePostResponse> => {
	const updatePostFn = httpsCallable<UpdatePostRequest, UpdatePostResponse>(
		functions,
		'updatePost'
	)
	const result = await updatePostFn(data)
	return result.data
}

export interface CreateReplyRequest {
	postId: string
	content: string
}

export interface CreateReplyResponse {
	success: true
	replyId: string
	message: string
}

/**
 * Creates a reply to a post via Firebase Function
 *
 * Security features:
 * - User must be authenticated with verified email
 * - User must not be banned for the season
 * - Content is validated (10-1000 characters)
 */
export const createReplyViaFunction = async (
	data: CreateReplyRequest
): Promise<CreateReplyResponse> => {
	const createReply = httpsCallable<CreateReplyRequest, CreateReplyResponse>(
		functions,
		'createReply'
	)
	const result = await createReply(data)
	return result.data
}

export interface UpdateReplyRequest {
	postId: string
	replyId: string
	content: string
}

export interface UpdateReplyResponse {
	success: true
	replyId: string
	message: string
}

/**
 * Updates a reply via Firebase Function
 *
 * Security features:
 * - User must be authenticated with verified email
 * - User must be the author of the reply
 * - Content is validated (10-1000 characters)
 */
export const updateReplyViaFunction = async (
	data: UpdateReplyRequest
): Promise<UpdateReplyResponse> => {
	const updateReplyFn = httpsCallable<UpdateReplyRequest, UpdateReplyResponse>(
		functions,
		'updateReply'
	)
	const result = await updateReplyFn(data)
	return result.data
}

export interface DeletePostRequest {
	postId: string
}

export interface DeletePostResponse {
	success: true
	postId: string
	message: string
	repliesDeleted: number
}

/**
 * Deletes a post and all its replies via Firebase Function (admin only)
 *
 * Security features:
 * - Only admins can delete posts
 * - All replies are deleted with the post
 */
export const deletePostViaFunction = async (
	data: DeletePostRequest
): Promise<DeletePostResponse> => {
	const deletePostFn = httpsCallable<DeletePostRequest, DeletePostResponse>(
		functions,
		'deletePost'
	)
	const result = await deletePostFn(data)
	return result.data
}

export interface DeleteReplyRequest {
	postId: string
	replyId: string
}

export interface DeleteReplyResponse {
	success: true
	replyId: string
	message: string
}

/**
 * Deletes a reply via Firebase Function (admin only)
 *
 * Security features:
 * - Only admins can delete replies
 * - Reply count on parent post is decremented
 */
export const deleteReplyViaFunction = async (
	data: DeleteReplyRequest
): Promise<DeleteReplyResponse> => {
	const deleteReplyFn = httpsCallable<DeleteReplyRequest, DeleteReplyResponse>(
		functions,
		'deleteReply'
	)
	const result = await deleteReplyFn(data)
	return result.data
}
