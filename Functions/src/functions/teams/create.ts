/**
 * Create team callable function
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, TeamDocument, PlayerDocument, PlayerSeason, SeasonDocument } from '../../types.js'
import { validateAuthentication } from '../../shared/auth.js'

interface CreateTeamRequest {
	name: string
	logo?: string
	seasonId: string
	storagePath?: string
}

export const createTeam = onCall<CreateTeamRequest>(
	{ region: 'us-central1' },
	async (request) => {
		// Validate authentication
		validateAuthentication(request.auth)

		const { name, logo, seasonId, storagePath } = request.data
		const userId = request.auth!.uid

		if (!name || !seasonId) {
			throw new Error('Team name and season ID are required')
		}

		try {
			const firestore = getFirestore()

			// Validate season exists
			const seasonRef = firestore.collection(Collections.SEASONS).doc(seasonId) as FirebaseFirestore.DocumentReference<SeasonDocument>
			const seasonDoc = await seasonRef.get()

			if (!seasonDoc.exists) {
				throw new Error('Invalid season ID')
			}

			// Get player document
			const playerRef = firestore.collection(Collections.PLAYERS).doc(userId)
			const playerDoc = await playerRef.get()

			if (!playerDoc.exists) {
				throw new Error('Player profile not found')
			}

			const playerDocument = playerDoc.data() as PlayerDocument | undefined

			if (!playerDocument) {
				throw new Error('Unable to retrieve player data')
			}

			// Check if player is already on a team for this season
			const existingSeasonData = playerDocument.seasons?.find(
				(season: PlayerSeason) => season.season.id === seasonId
			)

			if (existingSeasonData?.team) {
				throw new Error('Player is already on a team for this season')
			}

			// Create team document - Note: roster player refs are Firebase Admin SDK refs
			const teamDocument: Partial<TeamDocument> = {
				name: name.trim(),
				logo: logo || '',
				storagePath: storagePath || '',
				roster: [
					{
						player: playerRef, // Type assertion needed for Firebase Admin SDK compatibility
						captain: true,
					},
				] as TeamDocument['roster'],
				registered: false,
				// registeredDate will be set when team becomes registered
			}

			const teamRef = (await firestore
				.collection(Collections.TEAMS)
				.add(teamDocument)) as FirebaseFirestore.DocumentReference<TeamDocument>

			// Update player's season data to include team
			const updatedSeasons =
				playerDocument?.seasons?.map((season: PlayerSeason) =>
					season.season.id === seasonId
						? { ...season, team: teamRef, captain: true }
						: season
				) || []

			// If no season entry exists, create one
			if (!existingSeasonData) {
				updatedSeasons.push({
					season: seasonRef, // Firebase admin SDK DocumentReference
					team: teamRef, // Firebase admin SDK DocumentReference
					captain: true,
					paid: false,
					signed: false,
					banned: false,
				})
			}

			await playerRef.update({ seasons: updatedSeasons })

			logger.info(`Successfully created team: ${teamRef.id}`, {
				teamName: name,
				captainId: userId,
				seasonId,
			})

			return {
				success: true,
				teamId: teamRef.id,
				message: 'Team created successfully',
			}
		} catch (error) {
			logger.error('Error creating team:', {
				userId,
				teamName: name,
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			throw new Error(
				error instanceof Error ? error.message : 'Failed to create team'
			)
		}
	}
)
