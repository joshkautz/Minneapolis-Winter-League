/**
 * Create team callable function
 */

import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import * as functions from 'firebase-functions/v1'
import {
	Collections,
	TeamDocument,
	PlayerDocument,
	PlayerSeason,
	SeasonDocument,
} from '../../types.js'
import { validateAuthentication } from '../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../config/constants.js'

interface CreateTeamRequest {
	name: string
	logoBlob?: string // Base64 encoded image
	logoContentType?: string // MIME type of the image
	seasonId: string
	timezone?: string // User's browser timezone (e.g., 'America/New_York')
}

export const createTeam = functions
	.region(FIREBASE_CONFIG.REGION)
	.https.onCall(
		async (
			data: CreateTeamRequest,
			context: functions.https.CallableContext
		) => {
			// Validate authentication
			validateAuthentication(context.auth)

			const { name, logoBlob, logoContentType, seasonId, timezone } = data
			const userId = context.auth!.uid

			if (!name || !seasonId) {
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Team name and season ID are required'
				)
			}

			// Validate logo parameters if provided
			if (logoBlob && !logoContentType) {
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Logo content type is required when uploading logo'
				)
			}

			if (logoContentType && !logoContentType.startsWith('image/')) {
				throw new functions.https.HttpsError(
					'invalid-argument',
					'Only image files are allowed for logos'
				)
			}

			try {
				const firestore = getFirestore()

				// Validate season exists and registration is open
				const seasonRef = firestore
					.collection(Collections.SEASONS)
					.doc(seasonId) as FirebaseFirestore.DocumentReference<SeasonDocument>
				const seasonDoc = await seasonRef.get()

				if (!seasonDoc.exists) {
					throw new functions.https.HttpsError('not-found', 'Invalid season ID')
				}

				const seasonData = seasonDoc.data()!
				const now = new Date()

				// Validate registration is open
				const registrationStart = seasonData.registrationStart.toDate()
				const registrationEnd = seasonData.registrationEnd.toDate()

				if (now < registrationStart || now > registrationEnd) {
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

				// Get player document
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

				// Generate unique team ID
				const teamId = crypto.randomUUID()
				const fileId = crypto.randomUUID()
				let logoUrl = ''
				let storagePath = ''

				// Handle logo upload if provided
				if (logoBlob && logoContentType) {
					try {
						const storage = getStorage()
						const bucket = storage.bucket()
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

						// Make file publicly readable
						await file.makePublic()

						// Get proper public URL using the publicUrl() method
						logoUrl = file.publicUrl()
						storagePath = fileName

						functions.logger.info(
							`Successfully uploaded logo for team: ${teamId}`,
							{
								fileName,
								contentType: logoContentType,
							}
						)
					} catch (uploadError) {
						functions.logger.error('Logo upload failed:', uploadError)
						// Don't fail team creation if logo upload fails
						logoUrl = ''
						storagePath = ''
					}
				}

				// Create team document - Note: roster player refs are Firebase Admin SDK refs
				const teamDocument: Partial<TeamDocument> = {
					name: name.trim(),
					teamId,
					logo: logoUrl,
					storagePath,
					season: seasonRef,
					roster: [
						{
							player: playerRef, // Type assertion needed for Firebase Admin SDK compatibility
							captain: true,
						},
					] as TeamDocument['roster'],
					registered: false,
					placement: null,
					// registeredDate will be set when team becomes registered
				}

				const teamRef = (await firestore
					.collection(Collections.TEAMS)
					.add(
						teamDocument
					)) as FirebaseFirestore.DocumentReference<TeamDocument>

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

				functions.logger.info(`Successfully created team: ${teamRef.id}`, {
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
				functions.logger.error('Error creating team:', {
					userId,
					teamName: name,
					error: error instanceof Error ? error.message : 'Unknown error',
				})

				throw new functions.https.HttpsError(
					'internal',
					error instanceof Error ? error.message : 'Failed to create team'
				)
			}
		}
	)
