/**
 * Create season callable function
 *
 * Creates a new season document and seeds a `players/{uid}/playerSeasons/{seasonId}`
 * subdoc for every existing player. The legacy `seasons.teams[]` array is no
 * longer maintained — the list of teams in a season is derived from the
 * `collectionGroup('teamSeasons')` query at read time.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, WriteBatch } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	PLAYER_SEASONS_SUBCOLLECTION,
	PlayerSeasonDocument,
	SeasonDocument,
	SeasonFormat,
} from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { validateTeamRegistrationTotal } from '../../../shared/seasonPricing.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { parseSeasonInput } from '../../../shared/seasonInput.js'

interface CreateSeasonRequest {
	name: string
	dateStart: Date
	dateEnd: Date
	registrationStart: Date
	registrationEnd: Date
	stripe?: {
		priceId: string
		priceIdDev?: string
		returningPlayerCouponId?: string
		returningPlayerCouponIdDev?: string
	}
	format?: SeasonFormat
	/**
	 * Puts the season on team payments: each team registers on this much,
	 * in cents, committed by its roster in any split. Omit for per-player
	 * pricing.
	 */
	teamRegistrationTotalCents?: number
}

interface CreateSeasonResponse {
	success: boolean
	message: string
	seasonId?: string
}

export const createSeason = onCall<CreateSeasonRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { data, auth } = request

		const {
			name,
			dateStart,
			dateEnd,
			registrationStart,
			registrationEnd,
			stripe,
			format,
			teamRegistrationTotalCents,
		} = data

		const season = parseSeasonInput({
			name,
			dateStart,
			dateEnd,
			registrationStart,
			registrationEnd,
			stripe,
		})

		try {
			const firestore = getFirestore()
			await validateAdminUser(auth, firestore)

			const teamTotalCents =
				teamRegistrationTotalCents === undefined ||
				teamRegistrationTotalCents === null
					? undefined
					: validateTeamRegistrationTotal(teamRegistrationTotalCents)

			const seasonData: SeasonDocument = {
				name: season.name,
				dateStart: season.dateStart,
				dateEnd: season.dateEnd,
				registrationStart: season.registrationStart,
				registrationEnd: season.registrationEnd,
				...(season.stripe && { stripe: season.stripe }),
				...(format === SeasonFormat.SWISS && { format: SeasonFormat.SWISS }),
				// Set explicitly so the twelve-spot claim never reads a missing
				// counter as its own default.
				registeredTeamCount: 0,
				...(teamTotalCents !== undefined && {
					teamRegistrationTotalCents: teamTotalCents,
				}),
			}

			const seasonRef = (await firestore
				.collection(Collections.SEASONS)
				.add(seasonData)) as FirebaseFirestore.DocumentReference<SeasonDocument>

			logger.info(`Season created: ${seasonRef.id}`, {
				seasonId: seasonRef.id,
				name: seasonData.name,
				createdBy: auth?.uid,
			})

			// Seed a player season subdoc on every existing player.
			const playersSnapshot = await firestore
				.collection(Collections.PLAYERS)
				.get()

			if (playersSnapshot.empty) {
				return {
					success: true,
					message: `Season "${season.name}" created successfully (no existing players to update)`,
					seasonId: seasonRef.id,
				} as CreateSeasonResponse
			}

			const BATCH_SIZE = 400
			let batch: WriteBatch = firestore.batch()
			let operationsInBatch = 0
			let playersUpdated = 0
			let playersSkipped = 0

			for (const playerDoc of playersSnapshot.docs) {
				const playerSeasonsSubcollection = playerDoc.ref.collection(
					PLAYER_SEASONS_SUBCOLLECTION
				)
				const existingSeasonSubdoc = await playerSeasonsSubcollection
					.doc(seasonRef.id)
					.get()
				if (existingSeasonSubdoc.exists) {
					playersSkipped++
					continue
				}

				const newPlayerSeason: PlayerSeasonDocument = {
					season: seasonRef,
					team: null,
					paid: false,
					signed: false,
					captain: false,
				}
				batch.set(playerSeasonsSubcollection.doc(seasonRef.id), newPlayerSeason)
				operationsInBatch++
				playersUpdated++

				if (operationsInBatch >= BATCH_SIZE) {
					await batch.commit()
					batch = firestore.batch()
					operationsInBatch = 0
				}
			}

			if (operationsInBatch > 0) {
				await batch.commit()
			}

			logger.info('Season added to players', {
				seasonId: seasonRef.id,
				playersUpdated,
				playersSkipped,
				totalPlayers: playersSnapshot.size,
			})

			return {
				success: true,
				message: `Season "${season.name}" created successfully and added to ${playersUpdated} players`,
				seasonId: seasonRef.id,
			} as CreateSeasonResponse
		} catch (error) {
			if (error instanceof HttpsError) throw error
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'
			logger.error('Error creating season:', {
				name,
				userId: auth?.uid,
				error: errorMessage,
			})
			throw new HttpsError(
				'internal',
				'The season could not be created. Please try again.'
			)
		}
	}
)
