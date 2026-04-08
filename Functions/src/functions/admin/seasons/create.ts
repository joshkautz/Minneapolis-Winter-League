/**
 * Create season callable function
 *
 * Creates a new season document and seeds a `players/{uid}/seasons/{seasonId}`
 * subdoc for every existing player. The legacy `seasons.teams[]` array is no
 * longer maintained — the list of teams in a season is derived from the
 * collection-group `seasons` query at read time.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp, WriteBatch } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	PLAYER_SEASONS_SUBCOLLECTION,
	PlayerSeasonDocument,
	SeasonDocument,
	SeasonFormat,
} from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'

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
}

interface CreateSeasonResponse {
	success: boolean
	message: string
	seasonId?: string
}

export const createSeason = onCall<CreateSeasonRequest>(
	{ cors: [...FIREBASE_CONFIG.CORS_ORIGINS], region: FIREBASE_CONFIG.REGION },
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
		} = data

		if (
			!name ||
			!dateStart ||
			!dateEnd ||
			!registrationStart ||
			!registrationEnd
		) {
			throw new HttpsError(
				'invalid-argument',
				'Season name and all date fields are required'
			)
		}

		if (name.length < 3 || name.length > 100) {
			throw new HttpsError(
				'invalid-argument',
				'Season name must be between 3 and 100 characters'
			)
		}

		try {
			const firestore = getFirestore()
			await validateAdminUser(auth, firestore)

			const dateStartTimestamp = Timestamp.fromDate(new Date(dateStart))
			const dateEndTimestamp = Timestamp.fromDate(new Date(dateEnd))
			const registrationStartTimestamp = Timestamp.fromDate(
				new Date(registrationStart)
			)
			const registrationEndTimestamp = Timestamp.fromDate(
				new Date(registrationEnd)
			)

			const stripeConfig = stripe?.priceId
				? {
						priceId: stripe.priceId,
						...(stripe.priceIdDev && { priceIdDev: stripe.priceIdDev }),
						...(stripe.returningPlayerCouponId && {
							returningPlayerCouponId: stripe.returningPlayerCouponId,
						}),
						...(stripe.returningPlayerCouponIdDev && {
							returningPlayerCouponIdDev: stripe.returningPlayerCouponIdDev,
						}),
					}
				: undefined

			const seasonData: SeasonDocument = {
				name: name.trim(),
				dateStart: dateStartTimestamp,
				dateEnd: dateEndTimestamp,
				registrationStart: registrationStartTimestamp,
				registrationEnd: registrationEndTimestamp,
				...(stripeConfig && { stripe: stripeConfig }),
				...(format === SeasonFormat.SWISS && { format: SeasonFormat.SWISS }),
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
					message: `Season "${name}" created successfully (no existing players to update)`,
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

				// Preserve banned status from any prior banned season.
				const otherSeasonSubdocs = await playerSeasonsSubcollection.get()
				const bannedStatus = otherSeasonSubdocs.docs.some(
					(d) => d.data()?.banned === true
				)

				const newPlayerSeason: PlayerSeasonDocument = {
					season: seasonRef,
					team: null,
					paid: false,
					signed: false,
					banned: bannedStatus,
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
				message: `Season "${name}" created successfully and added to ${playersUpdated} players`,
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
				`Failed to create season: ${errorMessage}`
			)
		}
	}
)
