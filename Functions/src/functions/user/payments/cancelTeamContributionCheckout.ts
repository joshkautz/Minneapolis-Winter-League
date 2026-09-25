/**
 * Cancel the caller's open team contribution checkout.
 *
 * Opening a checkout reserves its amount, so a teammate cannot pay the same
 * dollars at the same time. When the payer comes back from Stripe without
 * paying, the App calls this, and the amount is free for teammates again at
 * once rather than when the session times out half an hour later. The
 * session is closed at Stripe too, so it can no longer be paid. See
 * services/teamCheckoutReservations.ts.
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - Only the caller's own checkouts, on their own team for the current
 *   season, read from their player-season; the request names nothing
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { validateAuthentication } from '../../../shared/auth.js'
import { getCurrentSeason, playerSeasonRef } from '../../../shared/database.js'
import { createStripeClient } from '../../../shared/stripe.js'
import { closeOpenCheckouts } from '../../../services/teamCheckoutReservations.js'
import type { PlayerSeasonDocument } from '../../../types.js'

interface CancelTeamContributionCheckoutResponse {
	success: true
	/** How many open checkouts were closed: 0 if there were none. */
	closed: number
}

export const cancelTeamContributionCheckout = onCall<
	Record<string, never>,
	Promise<CancelTeamContributionCheckoutResponse>
>(
	{ region: FIREBASE_CONFIG.REGION, secrets: ['STRIPE_SECRET_KEY'] },
	async (request) => {
		validateAuthentication(request.auth)
		const userId = request.auth.uid
		const firestore = getFirestore()

		const season = await getCurrentSeason()
		const seasonId = (season as { id?: string } | null)?.id
		if (!seasonId) {
			throw new HttpsError('failed-precondition', 'No current season found')
		}
		const teamRef = (
			(await playerSeasonRef(firestore, userId, seasonId).get()).data() as
				PlayerSeasonDocument | undefined
		)?.team
		if (!teamRef) return { success: true, closed: 0 }

		const closed = await closeOpenCheckouts(firestore, createStripeClient(), {
			teamId: teamRef.id,
			seasonId,
			playerId: userId,
		})
		return { success: true, closed }
	}
)
