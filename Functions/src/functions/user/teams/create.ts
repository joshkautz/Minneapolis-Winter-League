/**
 * Create team callable function
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must not be banned for the target season
 * - Registration must not have ended
 * - User must not already be on a team for this season
 * - Admins bypass banned and registration date restrictions
 *
 * Note: When creating a new season entry, banned status is preserved from
 * the most recent previous season to maintain ban continuity.
 */

import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	TeamDocument,
	PlayerDocument,
	PlayerSeason,
	SeasonDocument,
	DocumentReference,
} from '../../../types.js'
import { cancelPendingOffersForPlayer } from '../../../shared/offers.js'
import {
	validateAuthentication,
	validateNotBanned,
} from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { formatDateForUser } from '../../../shared/format.js'

interface CreateTeamRequest {
	name: string
	logoBlob?: string // Base64 encoded image
	logoContentType?: string // MIME type of the image
	seasonId: string
	timezone?: string // User's browser timezone (e.g., 'America/New_York')
}

export const createTeam = onCall<CreateTeamRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { auth, data } = request

		// Validate authentication
		validateAuthentication(auth)

		const { name, logoBlob, logoContentType, seasonId, timezone } = data
		const userId = auth?.uid ?? ''

		if (!name || !seasonId) {
			throw new HttpsError(
				'invalid-argument',
				'Team name and season ID are required'
			)
		}

		// Validate logo parameters if provided
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

			// Validate season exists and registration is open
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
			const now = new Date()

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

				if (now > registrationEnd) {
					throw new HttpsError(
						'failed-precondition',
						`Team registration has closed. Registration ended ${formatDateForUser(registrationEnd, timezone)}.`
					)
				}
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

					// Generate Firebase Storage URL (respects storage.rules)
					const encodedPath = encodeURIComponent(fileName)
					logoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`
					storagePath = fileName

					logger.info(`Successfully uploaded logo for team: ${teamId}`, {
						fileName,
						contentType: logoContentType,
					})
				} catch (uploadError) {
					logger.error('Logo upload failed:', uploadError)
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
				karma: 0, // Initialize karma to 0
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
			// Preserve banned status from most recent previous season if available
			if (!existingSeasonData) {
				// Find most recent previous season to get banned status
				const previousSeasons = playerDocument?.seasons?.filter(
					(s: PlayerSeason) => s.season.id !== seasonId
				)
				const mostRecentPreviousSeason = previousSeasons?.[0]
				const bannedStatus = mostRecentPreviousSeason?.banned || false

				updatedSeasons.push({
					season: seasonRef, // Firebase admin SDK DocumentReference
					team: teamRef, // Firebase admin SDK DocumentReference
					captain: true,
					paid: false,
					signed: false,
					banned: bannedStatus,
					lookingForTeam: false, // Not looking for team since they're creating one
				})
			}
			await playerRef.update({ seasons: updatedSeasons })

			// Cancel any pending offers for this player in this season
			// since they are now on a team
			const canceledOffersCount = await cancelPendingOffersForPlayer(
				firestore,
				playerRef as DocumentReference<PlayerDocument>,
				seasonRef as DocumentReference<SeasonDocument>,
				'Player created a new team'
			)

			logger.info(`Successfully created team: ${teamRef.id}`, {
				teamName: name,
				captainId: userId,
				seasonId,
				canceledPendingOffers: canceledOffersCount,
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

			throw new HttpsError(
				'internal',
				error instanceof Error ? error.message : 'Failed to create team'
			)
		}
	}
)
