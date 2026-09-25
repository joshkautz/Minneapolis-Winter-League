/**
 * Where a team-season's open checkout reservations live, and the arithmetic
 * over them. Kept free of Stripe and of the services, so the checkout
 * webhook's intake and the reservation service can both use it; see
 * `services/teamCheckoutReservations.ts` for what a reservation is for.
 */

import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import {
	Collections,
	TEAM_SEASONS_SUBCOLLECTION,
	type CheckoutReservation,
} from '../types.js'

export const CHECKOUTS_SUBCOLLECTION = 'checkouts'
export const OPEN_CHECKOUTS_DOC = 'open'

/** Firestore's NOT_FOUND, from updating a document that does not exist. */
const NOT_FOUND = 5

export function openCheckoutsRef(
	firestore: Firestore,
	teamId: string,
	seasonId: string
): FirebaseFirestore.DocumentReference {
	return firestore
		.collection(Collections.TEAMS)
		.doc(teamId)
		.collection(TEAM_SEASONS_SUBCOLLECTION)
		.doc(seasonId)
		.collection(CHECKOUTS_SUBCOLLECTION)
		.doc(OPEN_CHECKOUTS_DOC)
}

/**
 * What open checkouts have set aside. Every reservation that exists counts,
 * whatever its time says: `resolveExpiredReservations` asks Stripe about
 * those past it first, and removes only the ones whose session can no longer
 * take money — Stripe's clock is the one that closes a session. A payer's own
 * earlier checkout is closed before they reserve again, so it is not here to
 * count against them; one still here is a second request racing the first,
 * and counting it is what stops both going through. Pure, so the arithmetic
 * can be tested without a database.
 */
export function reservedCents(
	reservations: Record<string, CheckoutReservation>
): number {
	return Object.values(reservations).reduce(
		(sum, reservation) => sum + reservation.amountCents,
		0
	)
}

/** Ends a reservation. Doing so twice, or on a team that is gone, is fine. */
export async function removeReservation(
	firestore: Firestore,
	params: { teamId: string; seasonId: string; reservationId: string }
): Promise<void> {
	try {
		await openCheckoutsRef(firestore, params.teamId, params.seasonId).update({
			[`reservations.${params.reservationId}`]: FieldValue.delete(),
		})
	} catch (error) {
		if ((error as { code?: number }).code !== NOT_FOUND) throw error
	}
}
