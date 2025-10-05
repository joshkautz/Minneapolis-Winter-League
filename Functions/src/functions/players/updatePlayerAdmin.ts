/**
 * Update player (admin) callable function
 *
 * This function allows admins to update any player's document, including:
 * - Basic information (firstname, lastname)
 * - Admin status
 * - Season-specific data (captain, paid, signed, team)
 * - Email address (syncs with Firebase Authentication)
 */

import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions/v1'
import { validateAdminUser } from '../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'
import { Collections } from '../../types.js'
import type {
	DocumentReference,
	PlayerDocument,
	PlayerSeason,
	TeamDocument,
	TeamRosterPlayer,
} from '../../types.js'

/**
 * Season update data for a specific season
 */
interface SeasonUpdate {
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

/**
 * Request interface for updating a player document
 */
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
	/** Season updates (optional) */
	seasons?: SeasonUpdate[]
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

/**
 * Response interface for successful player update
 */
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
		/** Details about season changes */
		seasons?: SeasonChanges[]
	}
}

/**
 * Updates a player's document with admin privileges
 *
 * Security validations:
 * - User must be authenticated with verified email
 * - User must have admin privileges (admin: true in player document)
 * - Target player must exist
 * - Email format must be valid (if provided)
 * - Season IDs must exist (if provided)
 * - Team IDs must exist and belong to the correct season (if provided)
 *
 * After successful update:
 * - Player document is updated in Firestore
 * - Email is updated in Firebase Authentication (if changed)
 * - Email is automatically marked as verified (if changed)
 * - Operation is logged for audit purposes
 */
export const updatePlayerAdmin = functions
	.region(FIREBASE_CONFIG.REGION)
	.https.onCall(
		async (
			data: UpdatePlayerAdminRequest,
			context: functions.https.CallableContext
		): Promise<UpdatePlayerAdminResponse> => {
			const { auth } = context

			functions.logger.info('updatePlayerAdmin called', {
				adminUserId: auth?.uid,
				targetPlayerId: data.playerId,
				hasEmailUpdate: !!data.email,
				hasSeasonsUpdate: !!data.seasons,
			})

			// Validate admin authentication
			const firestore = getFirestore()
			await validateAdminUser(auth, firestore)

			const { playerId, firstname, lastname, admin, email, seasons } = data

			// Validate required fields
			if (!playerId || typeof playerId !== 'string') {
				functions.logger.warn('Invalid playerId provided', { playerId })
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Player ID is required and must be a valid string'
				)
			}

			// Validate that at least one field is being updated
			if (
				firstname === undefined &&
				lastname === undefined &&
				admin === undefined &&
				email === undefined &&
				!seasons
			) {
				functions.logger.warn('No fields to update', { playerId })
				throw new functions.https.HttpsError(
					'invalid-argument',
					'At least one field must be provided for update'
				)
			}

			// Validate email format if provided
			if (email !== undefined) {
				if (typeof email !== 'string' || !email.trim()) {
					functions.logger.warn('Invalid email provided', { email })
					throw new functions.https.HttpsError(
						'invalid-argument',
						'Email must be a non-empty string'
					)
				}

				const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
				if (!emailRegex.test(email.trim())) {
					functions.logger.warn('Invalid email format', { email: email.trim() })
					throw new functions.https.HttpsError(
						'invalid-argument',
						'Invalid email format. Please provide a valid email address.'
					)
				}
			}

			// Validate firstname if provided
			if (firstname !== undefined) {
				if (typeof firstname !== 'string' || !firstname.trim()) {
					functions.logger.warn('Invalid firstname provided', { firstname })
					throw new functions.https.HttpsError(
						'invalid-argument',
						'First name must be a non-empty string'
					)
				}
			}

			// Validate lastname if provided
			if (lastname !== undefined) {
				if (typeof lastname !== 'string' || !lastname.trim()) {
					functions.logger.warn('Invalid lastname provided', { lastname })
					throw new functions.https.HttpsError(
						'invalid-argument',
						'Last name must be a non-empty string'
					)
				}
			}

			// Validate admin if provided
			if (admin !== undefined && typeof admin !== 'boolean') {
				functions.logger.warn('Invalid admin value provided', { admin })
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Admin status must be a boolean value'
				)
			}

			// Validate seasons if provided
			if (seasons !== undefined) {
				if (!Array.isArray(seasons)) {
					functions.logger.warn('Invalid seasons provided', { seasons })
					throw new functions.https.HttpsError(
						'invalid-argument',
						'Seasons must be an array'
					)
				}

				for (const season of seasons) {
					if (!season.seasonId || typeof season.seasonId !== 'string') {
						functions.logger.warn('Invalid seasonId in seasons array', {
							season,
						})
						throw new functions.https.HttpsError(
							'invalid-argument',
							'Each season must have a valid seasonId'
						)
					}

					if (typeof season.captain !== 'boolean') {
						functions.logger.warn('Invalid captain value in seasons array', {
							season,
						})
						throw new functions.https.HttpsError(
							'invalid-argument',
							'Captain status must be a boolean value'
						)
					}

					if (typeof season.paid !== 'boolean') {
						functions.logger.warn('Invalid paid value in seasons array', {
							season,
						})
						throw new functions.https.HttpsError(
							'invalid-argument',
							'Paid status must be a boolean value'
						)
					}

					if (typeof season.signed !== 'boolean') {
						functions.logger.warn('Invalid signed value in seasons array', {
							season,
						})
						throw new functions.https.HttpsError(
							'invalid-argument',
							'Signed status must be a boolean value'
						)
					}

					if (
						season.banned !== undefined &&
						typeof season.banned !== 'boolean'
					) {
						functions.logger.warn('Invalid banned value in seasons array', {
							season,
						})
						throw new functions.https.HttpsError(
							'invalid-argument',
							'Banned status must be a boolean value'
						)
					}

					if (
						season.lookingForTeam !== undefined &&
						typeof season.lookingForTeam !== 'boolean'
					) {
						functions.logger.warn(
							'Invalid lookingForTeam value in seasons array',
							{
								season,
							}
						)
						throw new functions.https.HttpsError(
							'invalid-argument',
							'Looking for team status must be a boolean value'
						)
					}

					if (
						season.teamId !== null &&
						(typeof season.teamId !== 'string' || !season.teamId.trim())
					) {
						functions.logger.warn('Invalid teamId in seasons array', { season })
						throw new functions.https.HttpsError(
							'invalid-argument',
							'Team ID must be a string or null'
						)
					}
				}
			}

			try {
				const authInstance = getAuth()

				// Verify target player exists in Firestore
				functions.logger.info('Fetching target player from Firestore', {
					playerId,
				})

				const playerRef = firestore
					.collection(Collections.PLAYERS)
					.doc(playerId)
				const playerDoc = await playerRef.get()

				if (!playerDoc.exists) {
					functions.logger.error('Target player not found in Firestore', {
						playerId,
					})
					throw new functions.https.HttpsError(
						'not-found',
						'Player not found. Please verify the Player ID is correct.'
					)
				}

				const playerData = playerDoc.data()
				const currentEmail = playerData?.email

				functions.logger.info('Current player data retrieved', {
					playerId,
					currentEmail,
					currentFirstname: playerData?.firstname,
					currentLastname: playerData?.lastname,
					currentAdmin: playerData?.admin,
				})

				// Prepare update object for Firestore
				const updates: Record<string, unknown> = {}
				const changes: UpdatePlayerAdminResponse['changes'] = {}

				// Update basic fields
				if (
					firstname !== undefined &&
					firstname.trim() !== playerData?.firstname
				) {
					updates.firstname = firstname.trim()
					changes.firstname = {
						from: playerData?.firstname || '',
						to: firstname.trim(),
					}
				}

				if (
					lastname !== undefined &&
					lastname.trim() !== playerData?.lastname
				) {
					updates.lastname = lastname.trim()
					changes.lastname = {
						from: playerData?.lastname || '',
						to: lastname.trim(),
					}
				}

				if (admin !== undefined && admin !== playerData?.admin) {
					updates.admin = admin
					changes.admin = {
						from: playerData?.admin || false,
						to: admin,
					}
				}

				// Handle email update
				if (email !== undefined) {
					const trimmedNewEmail = email.trim().toLowerCase()

					// Check if email is different
					if (currentEmail?.toLowerCase() !== trimmedNewEmail) {
						// Check if new email is already in use by another user
						functions.logger.info('Checking if new email is already in use', {
							newEmail: trimmedNewEmail,
						})

						try {
							const existingUser =
								await authInstance.getUserByEmail(trimmedNewEmail)
							if (existingUser.uid !== playerId) {
								functions.logger.warn('Email already in use by another user', {
									newEmail: trimmedNewEmail,
									existingUserId: existingUser.uid,
								})
								throw new functions.https.HttpsError(
									'already-exists',
									`Email ${trimmedNewEmail} is already in use by another user.`
								)
							}
						} catch (error: unknown) {
							// If user not found, email is available
							if (
								error &&
								typeof error === 'object' &&
								'code' in error &&
								error.code === 'auth/user-not-found'
							) {
								functions.logger.info('Email is available', {
									newEmail: trimmedNewEmail,
								})
							} else {
								// Re-throw other errors (including already-exists)
								throw error
							}
						}

						// Update email in Firebase Authentication
						functions.logger.info('Updating email in Firebase Authentication', {
							playerId,
							oldEmail: currentEmail,
							newEmail: trimmedNewEmail,
						})

						await authInstance.updateUser(playerId, {
							email: trimmedNewEmail,
							emailVerified: true,
						})

						functions.logger.info(
							'Email successfully updated in Firebase Authentication',
							{
								playerId,
								newEmail: trimmedNewEmail,
							}
						)

						// Update email in Firestore
						updates.email = trimmedNewEmail
						changes.email = {
							from: currentEmail || '',
							to: trimmedNewEmail,
						}
					} else {
						functions.logger.info('Email unchanged, skipping email update', {
							playerId,
							email: trimmedNewEmail,
						})
					}
				}

				// Handle seasons update
				if (seasons && seasons.length > 0) {
					functions.logger.info('Processing season updates', {
						playerId,
						seasonsCount: seasons.length,
					})

					// Get current seasons from player document
					const currentSeasons = (playerData?.seasons || []) as PlayerSeason[]

					// Track season changes
					const seasonChanges: SeasonChanges[] = []

					// Validate all season and team references exist and fetch season names
					const seasonNames = new Map<string, string>()
					for (const seasonUpdate of seasons) {
						// Check if trying to add a new season (not allowed)
						const existsInCurrent = currentSeasons.some(
							(cs) => cs.season.id === seasonUpdate.seasonId
						)

						if (!existsInCurrent) {
							functions.logger.warn('Attempt to add new season rejected', {
								playerId,
								seasonId: seasonUpdate.seasonId,
							})
							throw new functions.https.HttpsError(
								'invalid-argument',
								`Cannot add new seasons through this function. Season ${seasonUpdate.seasonId} does not exist in player's current seasons. Use the dedicated season management functions to add seasons to players.`
							)
						}

						// Verify season exists
						const seasonRef = firestore
							.collection(Collections.SEASONS)
							.doc(seasonUpdate.seasonId)
						const seasonDoc = await seasonRef.get()

						if (!seasonDoc.exists) {
							functions.logger.error('Season not found', {
								seasonId: seasonUpdate.seasonId,
							})
							throw new functions.https.HttpsError(
								'not-found',
								`Season ${seasonUpdate.seasonId} not found`
							)
						}

						// Store season name for response
						const seasonData = seasonDoc.data()
						if (seasonData?.name) {
							seasonNames.set(seasonUpdate.seasonId, seasonData.name)
						}

						// Verify team exists and belongs to season (if teamId provided)
						if (seasonUpdate.teamId) {
							const teamRef = firestore
								.collection(Collections.TEAMS)
								.doc(seasonUpdate.teamId)
							const teamDoc = await teamRef.get()

							if (!teamDoc.exists) {
								functions.logger.error('Team not found', {
									teamId: seasonUpdate.teamId,
								})
								throw new functions.https.HttpsError(
									'not-found',
									`Team ${seasonUpdate.teamId} not found`
								)
							}

							const teamData = teamDoc.data()
							const teamSeasonId = teamData?.season?.id

							if (teamSeasonId !== seasonUpdate.seasonId) {
								functions.logger.error('Team does not belong to season', {
									teamId: seasonUpdate.teamId,
									teamSeasonId,
									expectedSeasonId: seasonUpdate.seasonId,
								})
								throw new functions.https.HttpsError(
									'invalid-argument',
									`Team ${seasonUpdate.teamId} does not belong to season ${seasonUpdate.seasonId}`
								)
							}
						}
					}

					// Build updated seasons array
					const updatedSeasons: PlayerSeason[] = currentSeasons.map(
						(currentSeason) => {
							// Find if this season is being updated
							const seasonUpdate = seasons.find(
								(s) => s.seasonId === currentSeason.season.id
							)

							if (seasonUpdate) {
								// Track what changed
								const seasonChange: SeasonChanges = {
									seasonId: seasonUpdate.seasonId,
									seasonName: seasonNames.get(seasonUpdate.seasonId),
									updated: true,
									changes: {},
								}

								// Track individual field changes
								if (seasonUpdate.captain !== currentSeason.captain) {
									seasonChange.changes!.captain = {
										from: currentSeason.captain,
										to: seasonUpdate.captain,
									}
								}

								if (seasonUpdate.paid !== currentSeason.paid) {
									seasonChange.changes!.paid = {
										from: currentSeason.paid,
										to: seasonUpdate.paid,
									}
								}

								if (seasonUpdate.signed !== currentSeason.signed) {
									seasonChange.changes!.signed = {
										from: currentSeason.signed,
										to: seasonUpdate.signed,
									}
								}

								const oldBanned = currentSeason.banned ?? false
								const newBanned = seasonUpdate.banned ?? oldBanned
								if (newBanned !== oldBanned) {
									seasonChange.changes!.banned = {
										from: oldBanned,
										to: newBanned,
									}
								}

								const oldLookingForTeam = currentSeason.lookingForTeam ?? false
								const newLookingForTeam =
									seasonUpdate.lookingForTeam ?? oldLookingForTeam
								if (newLookingForTeam !== oldLookingForTeam) {
									seasonChange.changes!.lookingForTeam = {
										from: oldLookingForTeam,
										to: newLookingForTeam,
									}
								}

								const oldTeamId = currentSeason.team?.id || null
								const newTeamId = seasonUpdate.teamId
								if (oldTeamId !== newTeamId) {
									seasonChange.changes!.team = {
										from: oldTeamId,
										to: newTeamId,
									}
								}

								// Only add to changes if something actually changed
								if (Object.keys(seasonChange.changes!).length > 0) {
									seasonChanges.push(seasonChange)
								}

								// Update this season
								const teamRef = seasonUpdate.teamId
									? (firestore
											.collection(Collections.TEAMS)
											.doc(
												seasonUpdate.teamId
											) as DocumentReference<TeamDocument>)
									: null

								return {
									...currentSeason,
									captain: seasonUpdate.captain,
									paid: seasonUpdate.paid,
									signed: seasonUpdate.signed,
									banned: newBanned,
									lookingForTeam: newLookingForTeam,
									team: teamRef,
								}
							}

							// Keep current season data unchanged
							return currentSeason
						}
					)

					updates.seasons = updatedSeasons

					// Update team rosters when a player's team changes
					for (const seasonUpdate of seasons) {
						const currentSeason = currentSeasons.find(
							(cs) => cs.season.id === seasonUpdate.seasonId
						)

						if (!currentSeason) continue

						const oldTeamId = currentSeason.team?.id || null
						const newTeamId = seasonUpdate.teamId

						// Team changed - need to update rosters
						if (oldTeamId !== newTeamId) {
							// Remove from old team roster
							if (oldTeamId) {
								const oldTeamRef = firestore
									.collection(Collections.TEAMS)
									.doc(oldTeamId)
								const oldTeamDoc = await oldTeamRef.get()

								if (oldTeamDoc.exists) {
									const oldTeamData = oldTeamDoc.data() as TeamDocument
									const updatedRoster = oldTeamData.roster.filter(
										(rp: TeamRosterPlayer) => rp.player.id !== playerId
									)

									await oldTeamRef.update({
										roster: updatedRoster,
									})

									functions.logger.info('Removed player from old team roster', {
										playerId,
										oldTeamId,
										seasonId: seasonUpdate.seasonId,
									})
								}
							}

							// Add to new team roster
							if (newTeamId) {
								const newTeamRef = firestore
									.collection(Collections.TEAMS)
									.doc(newTeamId)
								const newTeamDoc = await newTeamRef.get()

								if (newTeamDoc.exists) {
									const newTeamData = newTeamDoc.data() as TeamDocument

									// Check if player already exists in roster
									const existsInRoster = newTeamData.roster.some(
										(rp: TeamRosterPlayer) => rp.player.id === playerId
									)

									if (!existsInRoster) {
										const newRosterEntry: TeamRosterPlayer = {
											captain: seasonUpdate.captain,
											player: firestore
												.collection(Collections.PLAYERS)
												.doc(playerId) as DocumentReference<PlayerDocument>,
											dateJoined: Timestamp.now(),
										}

										await newTeamRef.update({
											roster: [...newTeamData.roster, newRosterEntry],
										})

										functions.logger.info('Added player to new team roster', {
											playerId,
											newTeamId,
											seasonId: seasonUpdate.seasonId,
											captain: seasonUpdate.captain,
										})
									} else {
										// Player exists, update captain status if needed
										const updatedRoster = newTeamData.roster.map(
											(rp: TeamRosterPlayer) => {
												if (rp.player.id === playerId) {
													return {
														...rp,
														captain: seasonUpdate.captain,
													}
												}
												return rp
											}
										)

										await newTeamRef.update({
											roster: updatedRoster,
										})

										functions.logger.info(
											'Updated player captain status in team roster',
											{
												playerId,
												newTeamId,
												seasonId: seasonUpdate.seasonId,
												captain: seasonUpdate.captain,
											}
										)
									}
								}
							}
						} else if (
							newTeamId &&
							seasonUpdate.captain !== currentSeason.captain
						) {
							// Team didn't change but captain status did
							const teamRef = firestore
								.collection(Collections.TEAMS)
								.doc(newTeamId)
							const teamDoc = await teamRef.get()

							if (teamDoc.exists) {
								const teamData = teamDoc.data() as TeamDocument
								const updatedRoster = teamData.roster.map(
									(rp: TeamRosterPlayer) => {
										if (rp.player.id === playerId) {
											return {
												...rp,
												captain: seasonUpdate.captain,
											}
										}
										return rp
									}
								)

								await teamRef.update({
									roster: updatedRoster,
								})

								functions.logger.info(
									'Updated player captain status in team roster',
									{
										playerId,
										teamId: newTeamId,
										seasonId: seasonUpdate.seasonId,
										captain: seasonUpdate.captain,
									}
								)
							}
						}
					}

					// Add season changes to response if there were any
					if (seasonChanges.length > 0) {
						changes.seasons = seasonChanges
					}
				}

				// Perform the update if there are any changes
				if (Object.keys(updates).length > 0) {
					functions.logger.info('Updating player document in Firestore', {
						playerId,
						updateFields: Object.keys(updates),
					})

					await playerRef.update(updates)

					functions.logger.info('Player document successfully updated', {
						playerId,
					})
				} else {
					functions.logger.info('No changes to apply', { playerId })
				}

				// Log successful operation for audit trail
				functions.logger.info('Player update completed successfully', {
					playerId,
					updatedBy: context.auth!.uid,
					changes: Object.keys(changes),
					timestamp: new Date().toISOString(),
				})

				return {
					success: true,
					playerId,
					message: 'Player successfully updated',
					changes,
				}
			} catch (error) {
				functions.logger.error('Error updating player', {
					playerId,
					adminUserId: context.auth!.uid,
					error: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
				})

				// Re-throw HttpsError as-is
				if (error instanceof functions.https.HttpsError) {
					throw error
				}

				// Handle specific Firebase Auth errors
				if (error && typeof error === 'object' && 'code' in error) {
					const firebaseError = error as { code: string; message: string }
					switch (firebaseError.code) {
						case 'auth/invalid-email':
							throw new functions.https.HttpsError(
								'invalid-argument',
								'Invalid email format provided.'
							)
						case 'auth/user-not-found':
							throw new functions.https.HttpsError(
								'not-found',
								'User not found in Firebase Authentication.'
							)
						case 'auth/email-already-exists':
							throw new functions.https.HttpsError(
								'already-exists',
								'Email is already in use by another user.'
							)
						default:
							functions.logger.error('Unhandled Firebase error', {
								code: firebaseError.code,
								message: firebaseError.message,
							})
					}
				}

				// Wrap other errors
				throw new functions.https.HttpsError(
					'internal',
					error instanceof Error
						? error.message
						: 'Failed to update player. Please try again.'
				)
			}
		}
	)
