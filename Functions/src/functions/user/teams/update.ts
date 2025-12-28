/**
 * Update team callable function
 */

import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { Collections, TeamDocument } from '../../../types.js'
import { validateAuthentication } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

interface EditTeamRequest {
	teamId: string
	name?: string
	logo?: string
	storagePath?: string
	logoBlob?: string // Base64 encoded image
	logoContentType?: string // MIME type of the image
}

/**
 * Edits team information (name, logo, storage path)
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be a captain of the team
 * - At least one field must be provided to update
 */
export const updateTeam = onCall<EditTeamRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		validateAuthentication(request.auth)

		const { teamId, name, logo, storagePath, logoBlob, logoContentType } =
			request.data
		const userId = request.auth?.uid ?? ''

		if (!teamId) {
			throw new Error('Team ID is required')
		}

		if (
			!name &&
			logo === undefined &&
			storagePath === undefined &&
			logoBlob === undefined
		) {
			throw new Error('At least one field must be provided to update')
		}

		// Validate logo parameters if provided
		if (logoBlob && !logoContentType) {
			throw new Error('Logo content type is required when uploading logo')
		}

		if (logoContentType && !logoContentType.startsWith('image/')) {
			throw new Error('Only image files are allowed for logos')
		}

		try {
			const firestore = getFirestore()
			const teamRef = firestore.collection(Collections.TEAMS).doc(teamId)

			// Handle logo upload if provided (must happen outside transaction)
			let logoUrl = logo
			let logoStoragePath = storagePath

			if (logoBlob && logoContentType) {
				try {
					const storage = getStorage()
					const bucket = storage.bucket()
					const fileId = crypto.randomUUID()
					const fileName = `teams/${fileId}`
					const file = bucket.file(fileName)

					// Convert base64 to buffer
					const buffer = Buffer.from(logoBlob, 'base64')

					// Upload file
					await file.save(buffer, {
						metadata: {
							contentType: logoContentType,
						},
					})

					// Generate Firebase Storage URL (respects storage.rules)
					const encodedPath = encodeURIComponent(fileName)
					logoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`
					logoStoragePath = fileName

					logger.info(`Successfully uploaded logo for team: ${teamId}`, {
						fileName,
						contentType: logoContentType,
					})
				} catch (uploadError) {
					logger.error('Logo upload failed:', uploadError)
					throw new Error('Failed to upload team logo')
				}
			}

			// Use transaction to atomically verify captain status and update
			const changedFields = await firestore.runTransaction(
				async (transaction) => {
					const teamDoc = await transaction.get(teamRef)

					if (!teamDoc.exists) {
						throw new Error('Team not found')
					}

					const teamDocument = teamDoc.data() as TeamDocument | undefined

					if (!teamDocument) {
						throw new Error('Unable to retrieve team data')
					}

					// Check if user is a captain of this team
					const userIsCaptain = teamDocument.roster?.some(
						(member) => member.player.id === userId && member.captain
					)

					if (!userIsCaptain) {
						throw new Error('Only team captains can edit team information')
					}

					// Build update data - only include fields that actually changed
					const updateData: Record<string, unknown> = {}
					const changes: string[] = []

					if (name !== undefined) {
						if (typeof name !== 'string' || name.trim() === '') {
							throw new Error('Team name must be a non-empty string')
						}
						const trimmedName = name.trim()
						// Only update name if it's different from current
						if (trimmedName !== teamDocument.name) {
							updateData.name = trimmedName
							changes.push('name')
						}
					}
					if (logoUrl !== undefined) {
						// Always update logo when provided (new upload)
						updateData.logo = logoUrl
						changes.push('logo')
					}
					if (logoStoragePath !== undefined) {
						updateData.storagePath = logoStoragePath
					}

					// Only perform update if there are actual changes
					if (Object.keys(updateData).length > 0) {
						transaction.update(teamRef, updateData)

						logger.info(`Successfully updated team: ${teamId}`, {
							updatedFields: Object.keys(updateData),
							changedFields: changes,
							updatedBy: userId,
						})
					}

					return changes
				}
			)

			// Build descriptive message based on what actually changed
			let message: string

			if (changedFields.length === 0) {
				message = 'No changes were made'
			} else if (
				changedFields.includes('name') &&
				changedFields.includes('logo')
			) {
				message = 'Updated team name and logo'
			} else if (changedFields.includes('name')) {
				message = 'Updated team name'
			} else if (changedFields.includes('logo')) {
				message = 'Updated team logo'
			} else {
				message = 'Updated team information'
			}

			return {
				success: true,
				teamId,
				message,
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error updating team:', {
				teamId,
				userId,
				error: errorMessage,
			})

			// Re-throw the original error message for better user experience
			throw new Error(errorMessage)
		}
	}
)
