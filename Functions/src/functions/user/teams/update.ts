/**
 * Update team callable function
 *
 * Edits a team's name or logo for a specific season. Captain check reads the
 * player's season subdoc.
 *
 * The logo is only ever an uploaded image. The request used to accept a
 * logo URL and Storage path as well, which let a captain point their team
 * at any file — and team deletion removes the file at that path.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { parseImageUpload, storeImage } from '../../../shared/images.js'
import { logger } from 'firebase-functions/v2'
import { validateAuthentication } from '../../../shared/auth.js'
import { playerSeasonRef, teamSeasonRef } from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface EditTeamRequest {
	teamId: string
	seasonId: string
	name?: string
	logoBlob?: string // Base64 encoded image
	logoContentType?: string // MIME type of the image
}

export const updateTeam = onCall<EditTeamRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		validateAuthentication(request.auth)

		const { teamId, seasonId, name, logoBlob, logoContentType } = request.data
		const userId = request.auth.uid

		if (!teamId || !seasonId) {
			throw new HttpsError(
				'invalid-argument',
				'Team ID and season ID are required'
			)
		}

		const logo = parseImageUpload(logoBlob, logoContentType, 'The logo')
		if (name === undefined && !logo) {
			throw new HttpsError(
				'invalid-argument',
				'There is nothing to change. Enter a new name or choose a logo.'
			)
		}
		if (
			name !== undefined &&
			(typeof name !== 'string' || name.trim() === '')
		) {
			throw new HttpsError('invalid-argument', 'Enter a team name.')
		}

		try {
			const firestore = getFirestore()
			const teamSeasonDocRef = teamSeasonRef(firestore, teamId, seasonId)

			// Captain check: read the player's season subdoc.
			const playerSeasonSnap = await playerSeasonRef(
				firestore,
				userId,
				seasonId
			).get()
			const playerSeasonData = playerSeasonSnap.data()
			if (
				!playerSeasonData ||
				playerSeasonData.team?.id !== teamId ||
				playerSeasonData.captain !== true
			) {
				throw new HttpsError(
					'permission-denied',
					'Only team captains can edit team information'
				)
			}

			// Verify the team season exists.
			const teamSeasonSnap = await teamSeasonDocRef.get()
			if (!teamSeasonSnap.exists) {
				throw new HttpsError('not-found', 'Team season not found')
			}
			const teamSeasonData = teamSeasonSnap.data()
			if (!teamSeasonData) {
				throw new HttpsError('internal', 'Unable to retrieve team data')
			}

			// Store the new logo (outside any transaction), after every check.
			const storedLogo = logo
				? await storeImage(`teams/${crypto.randomUUID()}`, logo, 'The logo')
				: null

			// Build update payload, only changing fields that actually changed.
			const updateData: Record<string, unknown> = {}
			const changes: string[] = []
			if (name !== undefined) {
				const trimmedName = name.trim()
				if (trimmedName !== teamSeasonData.name) {
					updateData.name = trimmedName
					changes.push('name')
				}
			}
			if (storedLogo) {
				updateData.logo = storedLogo.url
				updateData.storagePath = storedLogo.storagePath
				changes.push('logo')
			}

			if (Object.keys(updateData).length > 0) {
				await teamSeasonDocRef.update(updateData)
				logger.info(`Successfully updated team: ${teamId}/${seasonId}`, {
					updatedFields: Object.keys(updateData),
					changedFields: changes,
					updatedBy: userId,
				})
			}

			let message: string
			if (changes.length === 0) {
				message = 'No changes were made'
			} else if (changes.includes('name') && changes.includes('logo')) {
				message = 'Updated team name and logo'
			} else if (changes.includes('name')) {
				message = 'Updated team name'
			} else if (changes.includes('logo')) {
				message = 'Updated team logo'
			} else {
				message = 'Updated team information'
			}

			return { success: true, teamId, seasonId, message }
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'
			logger.error('Error updating team:', {
				teamId,
				seasonId,
				userId,
				error: errorMessage,
			})
			if (error instanceof HttpsError) throw error
			throw new HttpsError(
				'internal',
				'Your team could not be saved. Please try again.'
			)
		}
	}
)
