/**
 * Create team callable function
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, TeamDocument } from '@minneapolis-winter-league/shared'
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
			const seasonRef = firestore.collection(Collections.SEASONS).doc(seasonId)
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

			const playerDocument = playerDoc.data()

			// Check if player is already on a team for this season
			const existingSeasonData = playerDocument?.seasons?.find(
				(season: any) => season.season.id === seasonId
			)

			if (existingSeasonData?.team) {
				throw new Error('Player is already on a team for this season')
			}

			// Create team document
			const teamDocument: Partial<TeamDocument> = {
				name: name.trim(),
				logo: logo || '',
				storagePath: storagePath || '',
				roster: [
					{
						player: playerRef as any,
						captain: true,
					},
				],
				registered: false,
				registeredDate: undefined as any,
			}

			const teamRef = await firestore
				.collection(Collections.TEAMS)
				.add(teamDocument)

			// Update player's season data to include team
			const updatedSeasons = playerDocument?.seasons?.map((season: any) =>
				season.season.id === seasonId
					? { ...season, team: teamRef, captain: true }
					: season
			) || []

			// If no season entry exists, create one
			if (!existingSeasonData) {
				updatedSeasons.push({
					season: seasonRef as any,
					team: teamRef as any,
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
