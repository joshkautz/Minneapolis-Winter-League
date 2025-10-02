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

interface VerifyUserEmailRequest {
	/** User's email address OR Firebase Auth UID (one is required) */
	email?: string
	uid?: string
}

interface VerifyUserEmailResponse {
	success: true
	userId: string
	email: string
	message: string
}

/**
 * Marks a user's email as verified via Firebase Function
 *
 * Security features:
 * - Only admins can call this function
 * - Accepts either email or UID
 * - Updates Firebase Authentication only (no Firestore changes)
 * - Comprehensive error handling and logging
 */
export const verifyUserEmailViaFunction = async (
	data: VerifyUserEmailRequest
): Promise<VerifyUserEmailResponse> => {
	const verifyUserEmail = httpsCallable<
		VerifyUserEmailRequest,
		VerifyUserEmailResponse
	>(functions, 'verifyUserEmail')
	const result = await verifyUserEmail(data)
	return result.data
}

interface AddNewSeasonToPlayersRequest {
	/** Season ID to add to all players */
	seasonId: string
}

interface AddNewSeasonToPlayersResponse {
	success: boolean
	message: string
	/** Number of players updated */
	playersUpdated: number
	/** Number of players skipped (already had the season) */
	playersSkipped: number
}

/**
 * Adds a new PlayerSeason to all PlayerDocuments for a specified season
 * Only callable by admin users via the Admin Dashboard
 */
export const addNewSeasonToAllPlayersViaFunction = async (
	data: AddNewSeasonToPlayersRequest
): Promise<AddNewSeasonToPlayersResponse> => {
	const addNewSeasonToAllPlayers = httpsCallable<
		AddNewSeasonToPlayersRequest,
		AddNewSeasonToPlayersResponse
	>(functions, 'addNewSeasonToAllPlayers')
	const result = await addNewSeasonToAllPlayers(data)
	return result.data
}

interface PlayerWithPendingWaiver {
	/** Player's unique ID (Firebase Auth UID) */
	uid: string
	/** Player's first name */
	firstname: string
	/** Player's last name */
	lastname: string
	/** Player's email address */
	email: string
	/** Team name (if rostered) */
	teamName: string | null
	/** Team ID (if rostered) */
	teamId: string | null
}

interface GetPlayersWithPendingWaiversRequest {
	// Empty - operates on current season by default
}

interface GetPlayersWithPendingWaiversResponse {
	success: boolean
	message: string
	/** Season ID that was checked */
	seasonId: string
	/** Season name that was checked */
	seasonName: string
	/** Array of players with pending waivers */
	players: PlayerWithPendingWaiver[]
	/** Total count of players with pending waivers */
	count: number
}

/**
 * Gets all players who have paid for registration but haven't signed their waiver
 * Only callable by admin users via the Admin Dashboard
 */
export const getPlayersWithPendingWaiversViaFunction = async (
	data: GetPlayersWithPendingWaiversRequest = {}
): Promise<GetPlayersWithPendingWaiversResponse> => {
	const getPlayersWithPendingWaivers = httpsCallable<
		GetPlayersWithPendingWaiversRequest,
		GetPlayersWithPendingWaiversResponse
	>(functions, 'getPlayersWithPendingWaivers')
	const result = await getPlayersWithPendingWaivers(data)
	return result.data
}

//////////////////////////////////////////////////////////////////////////////
// PLAYER REGISTRATION STATUS (Admin)
//////////////////////////////////////////////////////////////////////////////

/**
 * Individual player registration status
 */
interface PlayerRegistrationStatus {
	/** Player's unique ID (Firebase Auth UID) */
	id: string
	/** Player's first name */
	firstname: string
	/** Player's last name */
	lastname: string
	/** Player's email address */
	email: string
	/** Email verification status from Firebase Authentication */
	emailVerified: boolean
	/** Payment status for current season */
	paid: boolean
	/** Waiver signed status for current season */
	signed: boolean
	/** Team name (if rostered for current season) */
	teamName: string | null
	/** Team ID (if rostered for current season) */
	teamId: string | null
	/** Whether the player is looking for a team */
	lookingForTeam: boolean
	/** Whether the player is on a fully registered team */
	isOnFullyRegisteredTeam: boolean
	/** Whether all registration steps are complete */
	isComplete: boolean
}

interface GetPlayerRegistrationStatusRequest {
	// Empty - operates on current season by default
}

interface GetPlayerRegistrationStatusResponse {
	success: boolean
	message: string
	/** Season ID that was checked */
	seasonId: string
	/** Season name that was checked */
	seasonName: string
	/** Array of player registration statuses */
	players: PlayerRegistrationStatus[]
	/** Total count of players */
	count: number
}

/**
 * Gets all players with their registration status including email verification from Firebase Auth
 * Only callable by admin users via the Admin Dashboard
 */
export const getPlayerRegistrationStatusViaFunction = async (
	data: GetPlayerRegistrationStatusRequest = {}
): Promise<GetPlayerRegistrationStatusResponse> => {
	const getPlayerRegistrationStatus = httpsCallable<
		GetPlayerRegistrationStatusRequest,
		GetPlayerRegistrationStatusResponse
	>(functions, 'getPlayerRegistrationStatus')
	const result = await getPlayerRegistrationStatus(data)
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

interface ManageTeamPlayerResponse {
	success: boolean
	message: string
	teamId: string
	playerId: string
}

/**
 * Manages team players (promote/demote/remove) via Firebase Function
 * Replaces promoteToCaptain, demoteFromCaptain, removeFromTeam functions
 */
export const manageTeamPlayerViaFunction = async (
	data: ManageTeamPlayerRequest
): Promise<ManageTeamPlayerResponse> => {
	const manageTeamPlayer = httpsCallable<
		ManageTeamPlayerRequest,
		ManageTeamPlayerResponse
	>(functions, 'manageTeamPlayer')
	const result = await manageTeamPlayer(data)
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

interface UpdateOfferStatusRequest {
	offerId: string
	status: 'accepted' | 'rejected' | 'canceled'
}

interface UpdateOfferStatusResponse {
	success: boolean
	message: string
	offerId: string
}

/**
 * Updates offer status (accept/reject) via Firebase Function
 * Replaces acceptOffer and rejectOffer functions
 */
export const updateOfferStatusViaFunction = async (
	data: UpdateOfferStatusRequest
): Promise<UpdateOfferStatusResponse> => {
	const updateOfferStatus = httpsCallable<
		UpdateOfferStatusRequest,
		UpdateOfferStatusResponse
	>(functions, 'updateOfferStatus')
	const result = await updateOfferStatus(data)
	return result.data
}

//////////////////////////////////////////////////////////////////////////////
// UTILITY FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

interface CleanupOffersResponse {
	success: boolean
	cleanedCount: number
	message: string
}

/**
 * Cleans up expired or conflicting offers (admin only)
 */
export const cleanupOffersViaFunction =
	async (): Promise<CleanupOffersResponse> => {
		const cleanupOffers = httpsCallable<void, CleanupOffersResponse>(
			functions,
			'cleanupOffers'
		)
		const result = await cleanupOffers()
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
	return manageTeamPlayerViaFunction({
		teamId: teamRef.id,
		playerId: playerRef.id,
		action: 'promote',
	})
}

export const demoteFromCaptain = async (
	playerRef: { id: string },
	teamRef: { id: string }
) => {
	return manageTeamPlayerViaFunction({
		teamId: teamRef.id,
		playerId: playerRef.id,
		action: 'demote',
	})
}

export const removeFromTeam = async (
	playerRef: { id: string },
	teamRef: { id: string }
) => {
	return manageTeamPlayerViaFunction({
		teamId: teamRef.id,
		playerId: playerRef.id,
		action: 'remove',
	})
}
