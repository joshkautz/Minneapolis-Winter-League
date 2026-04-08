/**
 * Firebase Authentication trigger functions
 *
 * When a user is deleted via Firebase Authentication, clean up all related data:
 * - Walk every team roster the player belongs to via collection-group query
 * - Delete each roster entry
 * - Delete the player's seasons subcollection
 * - Delete the player document
 * - Delete all related offers
 * - Delete local Stripe Firestore data (preserving Stripe customer for records)
 */

import { auth } from 'firebase-functions/v1'
import { UserRecord } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	DocumentReference,
	PLAYER_SEASONS_SUBCOLLECTION,
	PlayerDocument,
} from '../../types.js'
import { handleFunctionError } from '../../shared/errors.js'
import { isMigrationInProgress } from '../../shared/maintenance.js'

export const userDeleted = auth.user().onDelete(async (user: UserRecord) => {
	const { uid } = user

	try {
		logger.info(`Processing user deletion for UID: ${uid}`)

		const firestore = getFirestore()

		if (await isMigrationInProgress(firestore)) {
			logger.info('Skipping userDeleted — migration in progress', { uid })
			return
		}
		const playerRef = firestore
			.collection(Collections.PLAYERS)
			.doc(uid) as DocumentReference<PlayerDocument>

		const playerDoc = await playerRef.get()
		if (!playerDoc.exists) {
			logger.warn(`Player document not found for UID: ${uid}`)
			return
		}

		// 1. Find every roster entry pointing at this player via collection-group.
		const rosterEntriesSnap = await firestore
			.collectionGroup('roster')
			.where('player', '==', playerRef)
			.get()

		// 2. Delete every roster entry. These docs live at
		// teams/{teamId}/teamSeasons/{seasonId}/roster/{playerId}. After the
		// seasons subcollection rename, the roster collection group is
		// unambiguous so no parent-path disambiguation is required.
		//
		// Note: this intentionally bypasses `removePlayerFromTeam()` from
		// shared/membership.ts. That helper sets `team: null, captain: false`
		// on the player season subdoc to keep the dual-write invariant — but
		// the next step recursive-deletes the player's seasons subcollection
		// entirely, so the player-side write would be wasted work. Bulk
		// player deletion is the one legitimate exception to "always go
		// through the membership helper".
		let rosterEntriesDeleted = 0
		for (const rosterDoc of rosterEntriesSnap.docs) {
			await rosterDoc.ref.delete()
			rosterEntriesDeleted++
		}

		// 3. Recursive-delete the player's seasons subcollection.
		const playerSeasonsSnap = await playerRef
			.collection(PLAYER_SEASONS_SUBCOLLECTION)
			.get()
		for (const seasonSubdoc of playerSeasonsSnap.docs) {
			await seasonSubdoc.ref.delete()
		}

		// 4. Delete the player document itself.
		await playerRef.delete()

		// 5. Delete all offers for this player.
		const offersQuery = await firestore
			.collection(Collections.OFFERS)
			.where('player', '==', playerRef)
			.get()
		await Promise.all(offersQuery.docs.map((doc) => doc.ref.delete()))

		// 6. Stripe local data cleanup (preserves the Stripe customer).
		await cleanupLocalStripeData(firestore, uid)

		logger.info(`Successfully cleaned up data for deleted user: ${uid}`, {
			rosterEntriesDeleted,
			playerSeasonsDeleted: playerSeasonsSnap.size,
			deletedOffers: offersQuery.size,
		})
	} catch (error) {
		throw handleFunctionError(error, 'userDeleted', { uid })
	}
})

async function cleanupLocalStripeData(
	firestore: FirebaseFirestore.Firestore,
	uid: string
): Promise<void> {
	try {
		const stripeDocRef = firestore.collection(Collections.STRIPE).doc(uid)

		const checkoutsSnapshot = await stripeDocRef.collection('checkouts').get()
		await Promise.all(checkoutsSnapshot.docs.map((doc) => doc.ref.delete()))

		const paymentsSnapshot = await stripeDocRef.collection('payments').get()
		await Promise.all(paymentsSnapshot.docs.map((doc) => doc.ref.delete()))

		await stripeDocRef.delete()

		logger.info(`Cleaned up local Stripe data for user: ${uid}`)
	} catch (error) {
		logger.error(`Failed to cleanup local Stripe data for user: ${uid}`, {
			error,
		})
	}
}
