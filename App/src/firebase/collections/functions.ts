/**
 * Client-side wrappers for Firebase Functions
 *
 * These functions provide a clean interface to call Firebase Functions
 * from the client-side application, replacing the complex client-side
 * Firestore operations.
 */

import { httpsCallable } from 'firebase/functions'
import { functions } from '../app'

//////////////////////////////////////////////////////////////////////////////
// PLAYER FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

interface CreatePlayerRequest {
	firstname: string
	lastname: string
	email: string
	seasonId: string
}

interface CreatePlayerResponse {
	success: boolean
	playerId: string
	message: string
}

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

interface UpdatePlayerRequest {
	playerId?: string // Optional - defaults to authenticated user
	firstname?: string
	lastname?: string
}

interface UpdatePlayerResponse {
	success: boolean
	playerId: string
	message: string
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

interface DeletePlayerRequest {
	playerId?: string // Optional - defaults to authenticated user
	adminOverride?: boolean // Allow admin to force delete
}

interface DeletePlayerResponse {
	success: boolean
	playerId: string
	message: string
	warnings?: string[]
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
} //////////////////////////////////////////////////////////////////////////////
// TEAM FUNCTIONS
//////////////////////////////////////////////////////////////////////////////

interface CreateTeamRequest {
	name: string
	logo?: string
	seasonId: string
	storagePath?: string
}

interface CreateTeamResponse {
	teamId: string
	success: boolean
}

/**
 * Creates a new team via Firebase Function
 * Replaces the complex client-side createTeam function
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
	const editTeam = httpsCallable<EditTeamRequest, EditTeamResponse>(
		functions,
		'editTeam'
	)
	const result = await editTeam(data)
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
	status: 'accepted' | 'rejected'
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

//////////////////////////////////////////////////////////////////////////////
// DEPRECATED CLIENT-SIDE FUNCTION REPLACEMENTS
//////////////////////////////////////////////////////////////////////////////

/**
 * @deprecated Use updateOfferStatusViaFunction instead
 * Accepts an offer (invitation or request)
 */
export const acceptOffer = async (offerRef: { id: string }) => {
	return updateOfferStatusViaFunction({
		offerId: offerRef.id,
		status: 'accepted',
	})
}

/**
 * @deprecated Use updateOfferStatusViaFunction instead
 * Rejects an offer (invitation or request)
 */
export const rejectOffer = async (offerRef: { id: string }) => {
	return updateOfferStatusViaFunction({
		offerId: offerRef.id,
		status: 'rejected',
	})
}

/**
 * @deprecated Use editTeamViaFunction instead
 * Edits team information (name, logo, storage path)
 */
export const editTeam = async (
	teamRef: { id: string },
	name?: string,
	logo?: string,
	storagePath?: string
) => {
	const updateData: Partial<EditTeamRequest> = {}
	if (name !== undefined) updateData.name = name
	if (logo !== undefined) updateData.logo = logo
	if (storagePath !== undefined) updateData.storagePath = storagePath

	return editTeamViaFunction({
		teamId: teamRef.id,
		...updateData,
	})
}

export const invitePlayer = async (
	playerSnapshot: { id: string; data: () => unknown },
	teamSnapshot: { id: string; data: () => unknown }
) => {
	return createOfferViaFunction({
		playerId: playerSnapshot.id,
		teamId: teamSnapshot.id,
		type: 'invitation',
	})
}

export const requestToJoinTeam = async (
	playerSnapshot: { id: string },
	teamSnapshot: { id: string }
) => {
	return createOfferViaFunction({
		playerId: playerSnapshot.id,
		teamId: teamSnapshot.id,
		type: 'request',
	})
}
