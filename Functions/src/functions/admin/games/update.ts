/**
 * Update game callable function
 *
 * This function allows admins to update existing game documents with validation
 * for duplicate games (same time slot and field) and business logic constraints.
 */

import {
	getFirestore,
	Timestamp,
	type DocumentReference,
} from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { isGameField, parseGameKickoff } from '../../../shared/gameSchedule.js'
import {
	Collections,
	GameType,
	TEAM_SEASONS_SUBCOLLECTION,
} from '../../../types.js'

/**
 * Request interface for updating a game
 */
interface UpdateGameRequest {
	/** Game document ID to update */
	gameId: string
	/** Reference to the home team document ID (nullable) */
	homeTeamId?: string | null
	/** Reference to the away team document ID (nullable) */
	awayTeamId?: string | null
	/** Home team's score (nullable if score not yet recorded) */
	homeScore?: number | null
	/** Away team's score (nullable if score not yet recorded) */
	awayScore?: number | null
	/** Field number (1, 2, or 3) */
	field?: number
	/** Game type (regular or playoff) */
	type?: GameType
	/** ISO 8601 timestamp for the game date/time */
	timestamp?: string
	/** Season ID for the game */
	seasonId?: string
}

/**
 * Response interface for successful game update
 */
interface UpdateGameResponse {
	success: true
	gameId: string
	message: string
}

/**
 * Updates an existing game document in Firestore
 *
 * Security validations:
 * - User must be authenticated with verified email
 * - User must have admin privileges (admin: true in player document)
 * - Game must exist
 * - Field must be 1, 2, or 3 (if provided)
 * - Scores must be non-negative numbers (if provided)
 * - Season must exist (if provided)
 * - Teams must exist (if provided)
 * - No duplicate game at same time and field (if time/field changed)
 *
 * Business logic:
 * - Games are only allowed on Saturdays
 * - Games are only allowed at 6:00pm, 6:45pm, 7:30pm, or 8:15pm CT
 * - Each field can only have one game per time slot
 */
export const updateGame = onCall<
	UpdateGameRequest,
	Promise<UpdateGameResponse>
>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request): Promise<UpdateGameResponse> => {
		const { auth, data } = request

		logger.info('updateGame called', {
			adminUserId: auth?.uid,
			gameId: data.gameId,
		})

		// Validate admin authentication
		const firestore = getFirestore()
		await validateAdminUser(auth, firestore)

		const {
			gameId,
			homeTeamId,
			awayTeamId,
			homeScore,
			awayScore,
			field,
			type,
			timestamp,
			seasonId,
		} = data

		// Validate required fields
		if (!gameId || typeof gameId !== 'string') {
			logger.warn('Invalid gameId provided', { gameId })
			throw new HttpsError(
				'invalid-argument',
				'Game ID is required and must be a valid string'
			)
		}

		// Validate optional fields if provided
		if (
			homeScore !== undefined &&
			homeScore !== null &&
			(typeof homeScore !== 'number' || homeScore < 0)
		) {
			logger.warn('Invalid homeScore provided', { homeScore })
			throw new HttpsError(
				'invalid-argument',
				'Home score must be null or a non-negative number'
			)
		}

		if (
			awayScore !== undefined &&
			awayScore !== null &&
			(typeof awayScore !== 'number' || awayScore < 0)
		) {
			logger.warn('Invalid awayScore provided', { awayScore })
			throw new HttpsError(
				'invalid-argument',
				'Away score must be null or a non-negative number'
			)
		}

		if (field !== undefined && !isGameField(field)) {
			logger.warn('Invalid field provided', { field })
			throw new HttpsError('invalid-argument', 'Field must be 1, 2, or 3')
		}

		if (
			type !== undefined &&
			![GameType.REGULAR, GameType.PLAYOFF].includes(type)
		) {
			logger.warn('Invalid game type provided', { type })
			throw new HttpsError(
				'invalid-argument',
				'Game type must be "regular" or "playoff"'
			)
		}

		try {
			const gameRef = firestore.collection(Collections.GAMES).doc(gameId)

			// Build update data object
			const updateData: Record<
				string,
				Timestamp | number | string | null | GameType | DocumentReference
			> = {}

			// Handle timestamp update
			let gameDate: Date | undefined
			if (timestamp) {
				if (typeof timestamp !== 'string') {
					throw new HttpsError(
						'invalid-argument',
						'Timestamp must be a valid ISO 8601 string'
					)
				}

				gameDate = parseGameKickoff(timestamp)
				updateData.date = Timestamp.fromDate(gameDate)
			}

			// Add other fields to update
			if (homeScore !== undefined) {
				updateData.homeScore = homeScore
			}
			if (awayScore !== undefined) {
				updateData.awayScore = awayScore
			}
			if (field !== undefined) {
				updateData.field = field
			}
			if (type !== undefined) {
				updateData.type = type
			}

			// Use transaction for all database operations to ensure atomicity
			await firestore.runTransaction(async (transaction) => {
				// Verify game exists
				const gameDoc = await transaction.get(gameRef)
				if (!gameDoc.exists) {
					logger.warn('Game not found', { gameId })
					throw new HttpsError(
						'not-found',
						'Game not found. Please verify the game ID is correct.'
					)
				}

				const existingGameData = gameDoc.data()
				if (!existingGameData) {
					throw new HttpsError('not-found', 'Game data not found.')
				}

				// Handle season update
				if (seasonId !== undefined) {
					if (typeof seasonId !== 'string') {
						throw new HttpsError(
							'invalid-argument',
							'Season ID must be a valid string'
						)
					}

					const seasonRef = firestore
						.collection(Collections.SEASONS)
						.doc(seasonId)
					const seasonDoc = await transaction.get(seasonRef)
					if (!seasonDoc.exists) {
						logger.warn('Season not found', { seasonId })
						throw new HttpsError(
							'not-found',
							'Season not found. Please verify the season ID is correct.'
						)
					}
					updateData.season = seasonRef
				}

				// Handle team updates (explicitly handle null), and re-capture the
				// denormalized team names — see GameDocument.homeName/awayName.
				//
				// The name is a snapshot of the team's name *for the game's season*,
				// so it goes stale when either side of that pair changes: a different
				// team, or the same team in a different season. Re-reading only when
				// a team id was supplied left a game moved between seasons pointing
				// at the new season under the old season's names.
				const effectiveSeasonId =
					seasonId ?? existingGameData.season?.id ?? null
				const seasonChanged =
					seasonId !== undefined && seasonId !== existingGameData.season?.id

				/**
				 * Resolves one side's team ref and name together, so the two can
				 * never disagree. Returns nothing when this side needs no write.
				 */
				const resolveTeamSide = async (
					side: 'home' | 'away',
					requestedTeamId: string | null | undefined
				): Promise<void> => {
					const teamChanged = requestedTeamId !== undefined
					if (!teamChanged && !seasonChanged) {
						return
					}

					const nameField = side === 'home' ? 'homeName' : 'awayName'
					const currentTeamRef = existingGameData[side] as
						DocumentReference | null | undefined
					const teamId = teamChanged
						? requestedTeamId
						: (currentTeamRef?.id ?? null)

					if (!teamId) {
						// Only an explicit clear writes; a season move on a placeholder
						// game has no name to re-capture.
						if (teamChanged) {
							updateData[side] = null
							updateData[nameField] = null
						}
						return
					}

					if (!effectiveSeasonId) {
						throw new HttpsError(
							'failed-precondition',
							`Cannot update ${side} team: game has no season reference.`
						)
					}

					const teamDocRef = firestore.collection(Collections.TEAMS).doc(teamId)
					const teamSeasonSubdoc = await transaction.get(
						teamDocRef
							.collection(TEAM_SEASONS_SUBCOLLECTION)
							.doc(effectiveSeasonId)
					)
					if (!teamSeasonSubdoc.exists) {
						logger.warn(`${side} team not in season`, {
							teamId,
							seasonId: effectiveSeasonId,
						})
						throw new HttpsError(
							'not-found',
							`${side === 'home' ? 'Home' : 'Away'} team is not participating in this season.`
						)
					}

					updateData[side] = teamDocRef
					updateData[nameField] =
						(teamSeasonSubdoc.data()?.name as string) ?? null
				}

				await resolveTeamSide('home', homeTeamId)
				await resolveTeamSide('away', awayTeamId)

				// Check for duplicate game if date or field changed
				const updatedField = field ?? existingGameData.field
				const updatedDate = gameDate
					? Timestamp.fromDate(gameDate)
					: existingGameData.date

				if (field !== undefined || timestamp !== undefined) {
					// Query for potential duplicates
					const gamesRef = firestore.collection(Collections.GAMES)
					const duplicateQuery = await gamesRef
						.where('date', '==', updatedDate)
						.where('field', '==', updatedField)
						.limit(2)
						.get()

					// Check if there's a duplicate that's not the current game
					const hasDuplicate = duplicateQuery.docs.some(
						(doc) => doc.id !== gameId
					)

					if (hasDuplicate) {
						logger.warn('Duplicate game detected', {
							gameId,
							field: updatedField,
							timestamp: updatedDate,
						})
						throw new HttpsError(
							'already-exists',
							`A game already exists at this time slot on Field ${updatedField}. Please choose a different time or field.`
						)
					}
				}

				// Perform the update atomically
				logger.info('Updating game document', {
					gameId,
					updateData,
				})
				transaction.update(gameRef, updateData)
			})

			logger.info('Game updated successfully', {
				gameId,
				updatedBy: auth?.uid,
			})

			return {
				success: true,
				gameId,
				message: 'Game updated successfully',
			}
		} catch (error) {
			logger.error('Error updating game', {
				gameId,
				adminUserId: auth?.uid,
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			})

			// Re-throw HttpsError as-is
			if (error instanceof HttpsError) {
				throw error
			}

			// Wrap other errors
			throw new HttpsError(
				'internal',
				'The game could not be saved. Please try again.'
			)
		}
	}
)
