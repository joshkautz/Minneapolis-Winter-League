/**
 * Shared type definitions for player-related Firebase functions
 * These types must match exactly with the Firebase function implementations
 * in Functions/src/functions/players/
 */

/**
 * Request interface for creating a player
 * Must match Functions/src/functions/user/players/create.ts CreatePlayerRequest exactly
 *
 * Note: seasonId is no longer required - the backend automatically adds all
 * seasons where registration is still open (registrationEnd > now)
 */
export interface CreatePlayerRequest {
	firstname: string
	lastname: string
	email: string
}

/**
 * Response interface for creating a player
 * Must match Functions/src/functions/players/create.ts success response exactly
 */
export interface CreatePlayerResponse {
	success: boolean
	playerId: string
	message: string
}

/**
 * Request interface for updating a player
 * Must match Functions/src/functions/players/update.ts UpdatePlayerRequest exactly
 */
export interface UpdatePlayerRequest {
	playerId?: string // Optional - defaults to authenticated user
	firstname?: string
	lastname?: string
}

/**
 * Response interface for updating a player
 * Must match Functions/src/functions/players/update.ts success response exactly
 */
export interface UpdatePlayerResponse {
	success: boolean
	playerId: string
	message: string
}

/**
 * Response interface for a player deleting their own account
 * Must match Functions/src/functions/user/players/delete.ts DeletePlayerResponse
 */
export interface DeletePlayerResponse {
	success: true
	message: string
}
