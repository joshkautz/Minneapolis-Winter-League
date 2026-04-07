/**
 * Update team callable function
 *
 * Edits a team's per-season fields (name, logo, storagePath) for a specific
 * season. Captain check reads the player's season subdoc.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { validateAuthentication } from '../../../shared/auth.js'
import {
	playerSeasonRef,
	teamSeasonRef,
} from '../../../shared/database.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface EditTeamRequest {
	teamId: string
	seasonId: string
	name?: string
	logo?: string
	storagePath?: string
	logoBlob?: string // Base64 encoded image
	logoContentType?: string // MIME type of the image
}

export const updateTeam = onCall<EditTeamRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		validateAuthentication(request.auth)

		const {
			teamId,
			seasonId,
			name,
			logo,
			storagePath,
			logoBlob,
			logoContentType,
		} = request.data
		const userId = request.auth.uid

		if (!teamId || !seasonId) {
			throw new HttpsError(
				'invalid-argument',
				'Team ID and season ID are required'
			)
		}

		if (
			!name &&
			logo === undefined &&
			storagePath === undefined &&
			logoBlob === undefined
		) {
			throw new HttpsError(
				'invalid-argument',
				'At least one field must be provided to update'
			)
		}

		if (logoBlob && !logoContentType) {
			throw new HttpsError(
				'invalid-argument',
				'Logo content type is required when uploading logo'
			)
		}

		if (logoContentType && !logoContentType.startsWith('image/')) {
			throw new HttpsError(
				'invalid-argument',
				'Only image files are allowed for logos'
			)
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

			// Handle logo upload (outside any transaction).
			let logoUrl = logo
			let logoStoragePath = storagePath
			if (logoBlob && logoContentType) {
				try {
					const storage = getStorage()
					const bucket = storage.bucket()
					const fileId = crypto.randomUUID()
					const fileName = `teams/${fileId}`
					const file = bucket.file(fileName)
					const buffer = Buffer.from(logoBlob, 'base64')
					await file.save(buffer, { metadata: { contentType: logoContentType } })
					const encodedPath = encodeURIComponent(fileName)
					logoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`
					logoStoragePath = fileName
					logger.info(`Successfully uploaded logo for team: ${teamId}`, {
						fileName,
						contentType: logoContentType,
					})
				} catch (uploadError) {
					logger.error('Logo upload failed:', uploadError)
					throw new HttpsError('internal', 'Failed to upload team logo')
				}
			}

			// Build update payload, only changing fields that actually changed.
			const updateData: Record<string, unknown> = {}
			const changes: string[] = []
			if (name !== undefined) {
				if (typeof name !== 'string' || name.trim() === '') {
					throw new HttpsError(
						'invalid-argument',
						'Team name must be a non-empty string'
					)
				}
				const trimmedName = name.trim()
				if (trimmedName !== teamSeasonData.name) {
					updateData.name = trimmedName
					changes.push('name')
				}
			}
			if (logoUrl !== undefined) {
				updateData.logo = logoUrl
				changes.push('logo')
			}
			if (logoStoragePath !== undefined) {
				updateData.storagePath = logoStoragePath
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
			logger.error('Error updating team:', { teamId, seasonId, userId, error: errorMessage })
			if (error instanceof HttpsError) throw error
			throw new HttpsError('internal', errorMessage)
		}
	}
)
