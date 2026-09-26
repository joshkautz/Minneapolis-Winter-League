/**
 * Update season callable function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, SeasonDocument, SeasonFormat } from '../../../types.js'
import { validateAdminUser } from '../../../shared/auth.js'
import {
	seasonHoldsTeamMoney,
	validateTeamRegistrationTotal,
} from '../../../shared/seasonPricing.js'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { parseSeasonInput } from '../../../shared/seasonInput.js'

interface UpdateSeasonRequest {
	seasonId: string
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
	/** Season format - 'traditional' or 'swiss'. Defaults to 'traditional' */
	format?: SeasonFormat
	/**
	 * Team payments total in cents. Omitted: unchanged, so a form that does
	 * not know about it cannot clear it. A number: team payments at that
	 * total. Null: back to per-player pricing.
	 */
	teamRegistrationTotalCents?: number | null
}

interface UpdateSeasonResponse {
	success: boolean
	message: string
}

/**
 * Updates an existing season with proper authorization and validation
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - User must be an admin
 * - Season must exist
 * - Season name must be 3-100 characters
 * - All date fields are required
 * - A team registration total must be whole dollars, and cannot be changed
 *   or removed while any team in the season holds money
 */
export const updateSeason = onCall<UpdateSeasonRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { data, auth } = request

		const {
			seasonId,
			name,
			dateStart,
			dateEnd,
			registrationStart,
			registrationEnd,
			stripe,
			format,
			teamRegistrationTotalCents,
		} = data

		// Validate inputs
		if (!seasonId) {
			throw new HttpsError('invalid-argument', 'Season ID is required')
		}

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

			// Validate admin authentication
			await validateAdminUser(auth, firestore)

			// Check if season exists
			const seasonRef = firestore.collection(Collections.SEASONS).doc(seasonId)
			const seasonDoc = await seasonRef.get()

			if (!seasonDoc.exists) {
				throw new HttpsError('not-found', 'Season not found')
			}

			// Pricing. Only touched when the request says something about it.
			let pricingUpdate: Record<string, number | FieldValue> = {}
			if (teamRegistrationTotalCents !== undefined) {
				const next =
					teamRegistrationTotalCents === null
						? undefined
						: validateTeamRegistrationTotal(teamRegistrationTotalCents)
				const current = (seasonDoc.data() as SeasonDocument)
					.teamRegistrationTotalCents
				if (next !== current) {
					if (await seasonHoldsTeamMoney(firestore, seasonId)) {
						throw new HttpsError(
							'failed-precondition',
							'Teams in this season are holding money, so its pricing ' +
								'cannot change. Refund their contributions first.'
						)
					}
					pricingUpdate = {
						teamRegistrationTotalCents:
							next === undefined ? FieldValue.delete() : next,
					}
				}
			}

			// Update the season document
			const updateData: Record<string, unknown> = {
				name: season.name,
				dateStart: season.dateStart,
				dateEnd: season.dateEnd,
				registrationStart: season.registrationStart,
				registrationEnd: season.registrationEnd,
				...(season.stripe && { stripe: season.stripe }),
				// Traditional is stored as no format at all. Deleted rather than
				// written as undefined, which Firestore rejects — and did, for
				// every traditional season, until this was noticed.
				format:
					format === SeasonFormat.SWISS
						? SeasonFormat.SWISS
						: FieldValue.delete(),
				...pricingUpdate,
			}

			await seasonRef.update(updateData)

			logger.info(`Season updated: ${seasonId}`, {
				seasonId,
				name: season.name,
				updatedBy: auth?.uid,
			})

			return {
				success: true,
				message: `Season "${season.name}" updated successfully`,
			} as UpdateSeasonResponse
		} catch (error) {
			// If it's already an HttpsError, just re-throw it
			if (error instanceof HttpsError) {
				throw error
			}

			// Otherwise, log and convert to HttpsError
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			logger.error('Error updating season:', {
				seasonId,
				name,
				userId: auth?.uid,
				error: errorMessage,
			})

			throw new HttpsError(
				'internal',
				'The season could not be saved. Please try again.'
			)
		}
	}
)
