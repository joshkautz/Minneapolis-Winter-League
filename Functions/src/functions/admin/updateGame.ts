/**
 * Update game callable function
 *
 * This function allows admins to update existing game documents with validation
 * for duplicate games (same time slot and field) and business logic constraints.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions/v1'
import { validateAdminUser } from '../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { Collections, GameType } from '../../types.js'

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
 * - Games are only allowed on Saturdays in November and December
 * - Games are only allowed at 6:00pm, 6:45pm, 7:30pm, or 8:15pm CT
 * - Each field can only have one game per time slot
 */
export const updateGame = functions
	.region(FIREBASE_CONFIG.REGION)
	.https.onCall(
		async (
			data: UpdateGameRequest,
			context: functions.https.CallableContext
		): Promise<UpdateGameResponse> => {
			const { auth } = context

			functions.logger.info('updateGame called', {
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
				functions.logger.warn('Invalid gameId provided', { gameId })
				throw new functions.https.HttpsError(
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
				functions.logger.warn('Invalid homeScore provided', { homeScore })
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Home score must be null or a non-negative number'
				)
			}

			if (
				awayScore !== undefined &&
				awayScore !== null &&
				(typeof awayScore !== 'number' || awayScore < 0)
			) {
				functions.logger.warn('Invalid awayScore provided', { awayScore })
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Away score must be null or a non-negative number'
				)
			}

			if (field !== undefined && ![1, 2, 3].includes(field)) {
				functions.logger.warn('Invalid field provided', { field })
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Field must be 1, 2, or 3'
				)
			}

			if (
				type !== undefined &&
				![GameType.REGULAR, GameType.PLAYOFF].includes(type)
			) {
				functions.logger.warn('Invalid game type provided', { type })
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Game type must be "regular" or "playoff"'
				)
			}

			try {
				// Verify game exists
				const gameRef = firestore.collection(Collections.GAMES).doc(gameId)
				const gameDoc = await gameRef.get()
				if (!gameDoc.exists) {
					functions.logger.warn('Game not found', { gameId })
					throw new functions.https.HttpsError(
						'not-found',
						'Game not found. Please verify the game ID is correct.'
					)
				}

				const existingGameData = gameDoc.data()!

				// Build update data object
				const updateData: Record<string, any> = {}

				// Handle timestamp update
				let gameDate: Date | undefined
				if (timestamp) {
					if (typeof timestamp !== 'string') {
						throw new functions.https.HttpsError(
							'invalid-argument',
							'Timestamp must be a valid ISO 8601 string'
						)
					}

					gameDate = new Date(timestamp)
					if (isNaN(gameDate.getTime())) {
						throw new functions.https.HttpsError(
							'invalid-argument',
							'Invalid timestamp format. Must be a valid ISO 8601 string'
						)
					}

					// Extract date components from ISO string to avoid timezone issues
					// ISO format: YYYY-MM-DDTHH:MM:SS.sss±HH:MM
					const dateMatch = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})T/)
					if (!dateMatch) {
						throw new functions.https.HttpsError(
							'invalid-argument',
							'Invalid timestamp format: could not extract date'
						)
					}
					const year = parseInt(dateMatch[1], 10)
					const month = parseInt(dateMatch[2], 10) // 1-indexed in ISO string
					const dayOfMonth = parseInt(dateMatch[3], 10)

					// Validate business logic: Saturday only
					// Calculate day of week from the date components (in the intended timezone)
					// Using Zeller's congruence algorithm
					const adjustedMonth = month < 3 ? month + 12 : month
					const adjustedYear = month < 3 ? year - 1 : year
					const dayOfWeek =
						(dayOfMonth +
							Math.floor((13 * (adjustedMonth + 1)) / 5) +
							adjustedYear +
							Math.floor(adjustedYear / 4) -
							Math.floor(adjustedYear / 100) +
							Math.floor(adjustedYear / 400)) %
						7
					// Zeller's returns 0=Saturday, 1=Sunday, ..., 6=Friday
					if (dayOfWeek !== 0) {
						throw new functions.https.HttpsError(
							'invalid-argument',
							`Games can only be scheduled on Saturdays (received day: ${dayOfWeek})`
						)
					}

					// Validate business logic: November or December only
					if (month !== 11 && month !== 12) {
						throw new functions.https.HttpsError(
							'invalid-argument',
							`Games can only be scheduled in November or December (received month: ${month})`
						)
					} // Validate business logic: allowed time slots
					// Extract the local time directly from the ISO string to avoid timezone conversion issues
					// ISO format: YYYY-MM-DDTHH:MM:SS.sss±HH:MM
					const timeMatch = timestamp.match(/T(\d{2}):(\d{2})/)
					if (!timeMatch) {
						throw new functions.https.HttpsError(
							'invalid-argument',
							'Invalid timestamp format: could not extract time'
						)
					}
					const hours = parseInt(timeMatch[1], 10)
					const minutes = parseInt(timeMatch[2], 10)
					const timeString = `${hours}:${minutes.toString().padStart(2, '0')}`

					const allowedTimes = ['18:00', '18:45', '19:30', '20:15']
					if (!allowedTimes.includes(timeString)) {
						throw new functions.https.HttpsError(
							'invalid-argument',
							`Games can only be scheduled at 6:00pm, 6:45pm, 7:30pm, or 8:15pm CT (received: ${timeString})`
						)
					}

					// Log for debugging DST transitions
					functions.logger.info('Game time validation passed', {
						gameId,
						timestamp,
						localHours: hours,
						localMinutes: minutes,
						timeString,
						dayOfWeek,
						month,
						year,
						dayOfMonth,
						utcOffset: gameDate.getTimezoneOffset(),
					})

					updateData.date = Timestamp.fromDate(gameDate)
				} // Add other fields to update
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

				// Handle season update
				if (seasonId !== undefined) {
					if (typeof seasonId !== 'string') {
						throw new functions.https.HttpsError(
							'invalid-argument',
							'Season ID must be a valid string'
						)
					}

					const seasonRef = firestore
						.collection(Collections.SEASONS)
						.doc(seasonId)
					const seasonDoc = await seasonRef.get()
					if (!seasonDoc.exists) {
						functions.logger.warn('Season not found', { seasonId })
						throw new functions.https.HttpsError(
							'not-found',
							'Season not found. Please verify the season ID is correct.'
						)
					}
					updateData.season = seasonRef
				}

				// Handle team updates (explicitly handle null)
				if (homeTeamId !== undefined) {
					if (homeTeamId === null) {
						updateData.home = null
					} else {
						const homeTeamRef = firestore
							.collection(Collections.TEAMS)
							.doc(homeTeamId)
						const homeTeamDoc = await homeTeamRef.get()
						if (!homeTeamDoc.exists) {
							functions.logger.warn('Home team not found', { homeTeamId })
							throw new functions.https.HttpsError(
								'not-found',
								'Home team not found. Please verify the team ID is correct.'
							)
						}
						updateData.home = homeTeamRef
					}
				}

				if (awayTeamId !== undefined) {
					if (awayTeamId === null) {
						updateData.away = null
					} else {
						const awayTeamRef = firestore
							.collection(Collections.TEAMS)
							.doc(awayTeamId)
						const awayTeamDoc = await awayTeamRef.get()
						if (!awayTeamDoc.exists) {
							functions.logger.warn('Away team not found', { awayTeamId })
							throw new functions.https.HttpsError(
								'not-found',
								'Away team not found. Please verify the team ID is correct.'
							)
						}
						updateData.away = awayTeamRef
					}
				}

				// Check for duplicate game if date or field changed
				const updatedField = field ?? existingGameData.field
				const updatedDate = gameDate
					? Timestamp.fromDate(gameDate)
					: existingGameData.date

				if (field !== undefined || timestamp !== undefined) {
					const gamesRef = firestore.collection(Collections.GAMES)
					const duplicateQuery = await gamesRef
						.where('date', '==', updatedDate)
						.where('field', '==', updatedField)
						.limit(2) // Get up to 2 to check if there's another besides current
						.get()

					// Check if there's a duplicate that's not the current game
					const hasDuplicate = duplicateQuery.docs.some(
						(doc) => doc.id !== gameId
					)

					if (hasDuplicate) {
						functions.logger.warn('Duplicate game detected', {
							gameId,
							field: updatedField,
							timestamp: updatedDate,
						})
						throw new functions.https.HttpsError(
							'already-exists',
							`A game already exists at this time slot on Field ${updatedField}. Please choose a different time or field.`
						)
					}
				}

				// Perform the update
				functions.logger.info('Updating game document', { gameId, updateData })
				await gameRef.update(updateData)

				functions.logger.info('Game updated successfully', {
					gameId,
					updatedBy: context.auth!.uid,
				})

				return {
					success: true,
					gameId,
					message: 'Game updated successfully',
				}
			} catch (error) {
				functions.logger.error('Error updating game', {
					gameId,
					adminUserId: context.auth!.uid,
					error: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
				})

				// Re-throw HttpsError as-is
				if (error instanceof functions.https.HttpsError) {
					throw error
				}

				// Wrap other errors
				throw new functions.https.HttpsError(
					'internal',
					error instanceof Error
						? error.message
						: 'Failed to update game. Please try again.'
				)
			}
		}
	)
