/**
 * Rollover team callable function
 *
 * Rolls over an existing team from a previous season to the current season,
 * preserving the teamId but creating a new team document.
 */

import { getFirestore } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions/v1'
import {
	Collections,
	TeamDocument,
	PlayerDocument,
	PlayerSeason,
	SeasonDocument,
} from '../../types.js'
import { validateAuthentication } from '../../shared/auth.js'
import { Timestamp } from 'firebase-admin/firestore'
import { FIREBASE_CONFIG } from '../../config/constants.js'

interface RolloverTeamRequest {
	originalTeamId: string
	seasonId: string
	timezone?: string // User's browser timezone (e.g., 'America/New_York')
}

export const rolloverTeam = functions
	.region(FIREBASE_CONFIG.REGION)
	.https.onCall(
		async (
			data: RolloverTeamRequest,
			context: functions.https.CallableContext
		) => {
			// Validate authentication
			validateAuthentication(context.auth)

			const { originalTeamId, seasonId, timezone } = data
			const userId = context.auth!.uid

			if (!originalTeamId || !seasonId) {
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Original team ID and season ID are required'
				)
			}

			try {
				const firestore = getFirestore()

				// Validate season exists and is current
				const seasonRef = firestore
					.collection(Collections.SEASONS)
					.doc(seasonId) as FirebaseFirestore.DocumentReference<SeasonDocument>
				const seasonDoc = await seasonRef.get()

				if (!seasonDoc.exists) {
					throw new functions.https.HttpsError('not-found', 'Invalid season ID')
				}

				const seasonData = seasonDoc.data()!
				const now = Timestamp.now()

				// Get player document (needed for both admin check and later operations)
				const playerRef = firestore.collection(Collections.PLAYERS).doc(userId)
				const playerDoc = await playerRef.get()

				if (!playerDoc.exists) {
					throw new functions.https.HttpsError(
						'not-found',
						'Player profile not found'
					)
				}

				const playerDocument = playerDoc.data() as PlayerDocument | undefined

				if (!playerDocument) {
					throw new functions.https.HttpsError(
						'internal',
						'Unable to retrieve player data'
					)
				}

				// Check if user is an admin
				const isAdmin = playerDocument.admin === true

				// Validate registration is open (skip for admins)
				if (!isAdmin) {
					const registrationStart = seasonData.registrationStart.toDate()
					const registrationEnd = seasonData.registrationEnd.toDate()
					const currentTime = now.toDate()

					if (
						currentTime < registrationStart ||
						currentTime > registrationEnd
					) {
						const formatDate = (date: Date) => {
							const options: Intl.DateTimeFormatOptions = {
								year: 'numeric',
								month: 'long',
								day: 'numeric',
								hour: 'numeric',
								minute: '2-digit',
								timeZoneName: 'short',
								...(timezone && { timeZone: timezone }),
							}
							return date.toLocaleDateString('en-US', options)
						}
						throw new functions.https.HttpsError(
							'failed-precondition',
							`Team registration is not currently open. Registration opens ${formatDate(registrationStart)} and closes ${formatDate(registrationEnd)}.`
						)
					}
				} // Get original team to validate ownership and get team data
				const originalTeamsQuery = await firestore
					.collection(Collections.TEAMS)
					.where('teamId', '==', originalTeamId)
					.get()

				if (originalTeamsQuery.empty) {
					throw new functions.https.HttpsError(
						'not-found',
						'Original team not found'
					)
				}

				// Find the most recent version of this team
				const originalTeams = originalTeamsQuery.docs.map((doc) => ({
					...doc.data(),
					id: doc.id,
				})) as (TeamDocument & { id: string })[]

				// Get the most recent team document for this teamId
				const originalTeam = originalTeams.sort((a, b) => {
					// Sort by season dateStart descending to get most recent
					return b.season.id.localeCompare(a.season.id)
				})[0]

				if (!originalTeam) {
					throw new functions.https.HttpsError(
						'not-found',
						'Original team not found'
					)
				}

				// Validate user was a captain of the original team
				const userWasCaptain = originalTeam.roster.some(
					(rosterPlayer) =>
						rosterPlayer.player.id === userId && rosterPlayer.captain
				)

				if (!userWasCaptain) {
					throw new functions.https.HttpsError(
						'permission-denied',
						'Only captains of the original team can rollover the team'
					)
				}

				// Check if player is already on a team for this season
				const existingSeasonData = playerDocument.seasons?.find(
					(season: PlayerSeason) => season.season.id === seasonId
				)

				if (existingSeasonData?.team) {
					throw new functions.https.HttpsError(
						'already-exists',
						'Player is already on a team for this season'
					)
				}

				// Check if team has already been rolled over to this season
				const existingRolloverQuery = await firestore
					.collection(Collections.TEAMS)
					.where('teamId', '==', originalTeamId)
					.where('season', '==', seasonRef)
					.get()

				if (!existingRolloverQuery.empty) {
					throw new functions.https.HttpsError(
						'already-exists',
						'Team has already been rolled over for this season'
					)
				}

				// Create new team document with rolled over data
				const newTeamDocument: Partial<TeamDocument> = {
					name: originalTeam.name,
					logo: originalTeam.logo,
					storagePath: originalTeam.storagePath,
					teamId: originalTeamId, // Preserve original teamId
					season: seasonRef,
					roster: [
						{
							player: playerRef,
							captain: true,
						},
					] as TeamDocument['roster'],
					registered: false, // Always false initially
					placement: null,
					karma: 0, // Initialize karma to 0
				}

				const newTeamRef = (await firestore
					.collection(Collections.TEAMS)
					.add(
						newTeamDocument
					)) as FirebaseFirestore.DocumentReference<TeamDocument>

				// Update player's season data to include the new team
				const updatedSeasons =
					playerDocument?.seasons?.map((season: PlayerSeason) =>
						season.season.id === seasonId
							? { ...season, team: newTeamRef, captain: true }
							: season
					) || []

				// If no season entry exists, create one
				if (!existingSeasonData) {
					updatedSeasons.push({
						season: seasonRef,
						team: newTeamRef,
						captain: true,
						paid: false,
						signed: false,
						banned: false,
						lookingForTeam: false, // Not looking for team since they're creating one
					})
				}
				await playerRef.update({ seasons: updatedSeasons })

				functions.logger.info(
					`Successfully rolled over team: ${newTeamRef.id}`,
					{
						originalTeamId,
						newTeamId: newTeamRef.id,
						teamName: originalTeam.name,
						captainId: userId,
						seasonId,
					}
				)

				return {
					success: true,
					teamId: newTeamRef.id,
					message: 'Team rolled over successfully',
				}
			} catch (error) {
				functions.logger.error('Error rolling over team:', {
					userId,
					originalTeamId,
					seasonId,
					error: error instanceof Error ? error.message : 'Unknown error',
				})

				throw new functions.https.HttpsError(
					'internal',
					error instanceof Error ? error.message : 'Failed to rollover team'
				)
			}
		}
	)
