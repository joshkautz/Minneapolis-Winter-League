/**
 * Rollover team callable function
 *
 * Rolls over an existing team from a previous season to the current season,
 * preserving the teamId but creating a new team document.
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must not be banned for the target season
 * - Registration must not have ended
 * - User must have been a captain of the original team
 * - User must not already be on a team for this season
 * - Team must not have already been rolled over for this season
 * - Admins bypass banned and registration date restrictions
 *
 * Note: When creating a new season entry, banned status is preserved from
 * the most recent previous season to maintain ban continuity.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	TeamDocument,
	PlayerDocument,
	PlayerSeason,
	SeasonDocument,
} from '../../../types.js'
import {
	validateAuthentication,
	validateNotBanned,
} from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { formatDateForUser } from '../../../shared/format.js'

interface RolloverTeamRequest {
	originalTeamId: string
	seasonId: string
	timezone?: string // User's browser timezone (e.g., 'America/New_York')
}

export const rolloverTeam = onCall<RolloverTeamRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { auth, data } = request

		// Validate authentication
		validateAuthentication(auth)

		const { originalTeamId, seasonId, timezone } = data
		const userId = auth?.uid ?? ''

		if (!originalTeamId || !seasonId) {
			throw new HttpsError(
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
				throw new HttpsError('not-found', 'Invalid season ID')
			}

			const seasonData = seasonDoc.data()
			if (!seasonData) {
				throw new HttpsError('internal', 'Unable to retrieve season data')
			}
			const now = Timestamp.now()

			// Get player document (needed for both admin check and later operations)
			const playerRef = firestore.collection(Collections.PLAYERS).doc(userId)
			const playerDoc = await playerRef.get()

			if (!playerDoc.exists) {
				throw new HttpsError('not-found', 'Player profile not found')
			}

			const playerDocument = playerDoc.data() as PlayerDocument | undefined

			if (!playerDocument) {
				throw new HttpsError('internal', 'Unable to retrieve player data')
			}

			// Check if user is an admin
			const isAdmin = playerDocument.admin === true

			// Validate player is not banned for this season (skip for admins)
			if (!isAdmin) {
				validateNotBanned(playerDocument, seasonId)
			}

			// Validate season is still accepting teams (allow pre-registration before registration opens)
			// Skip check for admins
			if (!isAdmin) {
				const registrationEnd = seasonData.registrationEnd.toDate()
				const currentTime = now.toDate()

				if (currentTime > registrationEnd) {
					throw new HttpsError(
						'failed-precondition',
						`Team registration has closed. Registration ended ${formatDateForUser(registrationEnd, timezone)}.`
					)
				}
			} // Get original team to validate ownership and get team data
			const originalTeamsQuery = await firestore
				.collection(Collections.TEAMS)
				.where('teamId', '==', originalTeamId)
				.get()

			if (originalTeamsQuery.empty) {
				throw new HttpsError('not-found', 'Original team not found')
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
				throw new HttpsError('not-found', 'Original team not found')
			}

			// Validate user was a captain of the original team
			const userWasCaptain = originalTeam.roster.some(
				(rosterPlayer) =>
					rosterPlayer.player.id === userId && rosterPlayer.captain
			)

			if (!userWasCaptain) {
				throw new HttpsError(
					'permission-denied',
					'Only captains of the original team can rollover the team'
				)
			}

			// Check if player is already on a team for this season
			const existingSeasonData = playerDocument.seasons?.find(
				(season: PlayerSeason) => season.season.id === seasonId
			)

			if (existingSeasonData?.team) {
				throw new HttpsError(
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
				throw new HttpsError(
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
			// Preserve banned status from most recent previous season if available
			if (!existingSeasonData) {
				// Find most recent previous season to get banned status
				const previousSeasons = playerDocument?.seasons?.filter(
					(s: PlayerSeason) => s.season.id !== seasonId
				)
				const mostRecentPreviousSeason = previousSeasons?.[0]
				const bannedStatus = mostRecentPreviousSeason?.banned || false

				updatedSeasons.push({
					season: seasonRef,
					team: newTeamRef,
					captain: true,
					paid: false,
					signed: false,
					banned: bannedStatus,
					lookingForTeam: false, // Not looking for team since they're creating one
				})
			}
			await playerRef.update({ seasons: updatedSeasons })

			logger.info(`Successfully rolled over team: ${newTeamRef.id}`, {
				originalTeamId,
				newTeamId: newTeamRef.id,
				teamName: originalTeam.name,
				captainId: userId,
				seasonId,
			})

			return {
				success: true,
				teamId: newTeamRef.id,
				message: 'Team rolled over successfully',
			}
		} catch (error) {
			logger.error('Error rolling over team:', {
				userId,
				originalTeamId,
				seasonId,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new HttpsError(
				'internal',
				error instanceof Error ? error.message : 'Failed to rollover team'
			)
		}
	}
)
