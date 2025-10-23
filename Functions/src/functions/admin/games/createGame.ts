/**
 * Create game callable function
 *
 * This function allows admins to create new game documents with validation
 * for duplicate games (same time slot and field) and business logic constraints.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions/v1'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { Collections, GameType } from '../../../types.js'

/**
 * Request interface for creating a game
 */
interface CreateGameRequest {
	/** Reference to the home team document ID (nullable) */
	homeTeamId: string | null
	/** Reference to the away team document ID (nullable) */
	awayTeamId: string | null
	/** Home team's score (nullable if score not yet recorded) */
	homeScore: number | null
	/** Away team's score (nullable if score not yet recorded) */
	awayScore: number | null
	/** Field number (1, 2, or 3) */
	field: number
	/** Game type (regular or playoff) */
	type: GameType
	/** ISO 8601 timestamp for the game date/time */
	timestamp: string
	/** Season ID for the game */
	seasonId: string
}

/**
 * Response interface for successful game creation
 */
interface CreateGameResponse {
	success: true
	gameId: string
	message: string
}

/**
 * Creates a new game document in Firestore
 *
 * Security validations:
 * - User must be authenticated with verified email
 * - User must have admin privileges (admin: true in player document)
 * - Field must be 1, 2, or 3
 * - Scores must be non-negative numbers
 * - Season must exist
 * - Teams must exist (if provided)
 * - No duplicate game at same time and field
 *
 * Business logic:
 * - Games are only allowed on Saturdays in November and December
 * - Games are only allowed at 6:00pm, 6:45pm, 7:30pm, or 8:15pm CT
 * - Each field can only have one game per time slot
 */
export const createGame = functions
	.region(FIREBASE_CONFIG.REGION)
	.https.onCall(
		async (
			data: CreateGameRequest,
			context: functions.https.CallableContext
		): Promise<CreateGameResponse> => {
			const { auth } = context

			functions.logger.info('createGame called', {
				adminUserId: auth?.uid,
				field: data.field,
				timestamp: data.timestamp,
			})

			// Validate admin authentication
			const firestore = getFirestore()
			await validateAdminUser(auth, firestore)

			const {
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
			if (
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
				awayScore !== null &&
				(typeof awayScore !== 'number' || awayScore < 0)
			) {
				functions.logger.warn('Invalid awayScore provided', { awayScore })
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Away score must be null or a non-negative number'
				)
			}

			if (![1, 2, 3].includes(field)) {
				functions.logger.warn('Invalid field provided', { field })
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Field must be 1, 2, or 3'
				)
			}

			if (![GameType.REGULAR, GameType.PLAYOFF].includes(type)) {
				functions.logger.warn('Invalid game type provided', { type })
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Game type must be "regular" or "playoff"'
				)
			}

			if (!timestamp || typeof timestamp !== 'string') {
				functions.logger.warn('Invalid timestamp provided', { timestamp })
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Timestamp is required and must be a valid ISO 8601 string'
				)
			}

			if (!seasonId || typeof seasonId !== 'string') {
				functions.logger.warn('Invalid seasonId provided', { seasonId })
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Season ID is required and must be a valid string'
				)
			}

			try {
				// Parse and validate timestamp
				const gameDate = new Date(timestamp)
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
				} // Validate business logic: allowed time slots (6:00pm, 6:45pm, 7:30pm, 8:15pm CT)
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
				} // Log for debugging DST transitions
				functions.logger.info('Game time validation passed', {
					timestamp,
					localHours: hours,
					localMinutes: minutes,
					timeString,
					dayOfWeek,
					month: month + 1,
					utcOffset: gameDate.getTimezoneOffset(),
				})

				// Validate season exists
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

				// Validate teams exist (if provided)
				let homeTeamRef = null
				if (homeTeamId) {
					homeTeamRef = firestore.collection(Collections.TEAMS).doc(homeTeamId)
					const homeTeamDoc = await homeTeamRef.get()
					if (!homeTeamDoc.exists) {
						functions.logger.warn('Home team not found', { homeTeamId })
						throw new functions.https.HttpsError(
							'not-found',
							'Home team not found. Please verify the team ID is correct.'
						)
					}
				}

				let awayTeamRef = null
				if (awayTeamId) {
					awayTeamRef = firestore.collection(Collections.TEAMS).doc(awayTeamId)
					const awayTeamDoc = await awayTeamRef.get()
					if (!awayTeamDoc.exists) {
						functions.logger.warn('Away team not found', { awayTeamId })
						throw new functions.https.HttpsError(
							'not-found',
							'Away team not found. Please verify the team ID is correct.'
						)
					}
				}

				// Check for duplicate game (same time and field)
				const gamesRef = firestore.collection(Collections.GAMES)
				const duplicateQuery = await gamesRef
					.where('date', '==', Timestamp.fromDate(gameDate))
					.where('field', '==', field)
					.limit(1)
					.get()

				if (!duplicateQuery.empty) {
					const existingGame = duplicateQuery.docs[0]
					functions.logger.warn('Duplicate game detected', {
						existingGameId: existingGame.id,
						field,
						timestamp,
					})
					throw new functions.https.HttpsError(
						'already-exists',
						`A game already exists at this time slot on Field ${field}. Please choose a different time or field.`
					)
				}

				// Create the game document
				const gameData = {
					home: homeTeamRef,
					away: awayTeamRef,
					homeScore,
					awayScore,
					field,
					type,
					date: Timestamp.fromDate(gameDate),
					season: seasonRef,
				}

				functions.logger.info('Creating game document', { gameData })
				const gameRef = await gamesRef.add(gameData)

				functions.logger.info('Game created successfully', {
					gameId: gameRef.id,
					field,
					timestamp,
					createdBy: context.auth!.uid,
				})

				return {
					success: true,
					gameId: gameRef.id,
					message: `Game created successfully on Field ${field}`,
				}
			} catch (error) {
				functions.logger.error('Error creating game', {
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
						: 'Failed to create game. Please try again.'
				)
			}
		}
	)
