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
	data: DeleteTeamRequest
): Promise<DeleteTeamResponse> => {
	const deleteTeam = httpsCallable<DeleteTeamRequest, DeleteTeamResponse>(
		functions,
		'deleteTeam'
	)
	const result = await deleteTeam(data)
	return result.data
}

interface ManagePlayerRequest {
	teamId: string
	playerId: string
	action: 'promote' | 'demote' | 'remove'
}

interface ManagePlayerResponse {
	success: boolean
	action: string
}

/**
 * Manages team players (promote, demote, remove) via Firebase Function
 * Replaces promoteToCaptain, demoteFromCaptain, removeFromTeam functions
 */
export const manageTeamPlayerViaFunction = async (
	data: ManagePlayerRequest
): Promise<ManagePlayerResponse> => {
	const manageTeamPlayer = httpsCallable<
		ManagePlayerRequest,
		ManagePlayerResponse
	>(functions, 'manageTeamPlayer')
	const result = await manageTeamPlayer(data)
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

export const invitePlayer = async (
	playerSnapshot: { id: string; data: () => any },
	teamSnapshot: { id: string; data: () => any }
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
