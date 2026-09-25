/**
 * Removes a player's data when their account is deleted.
 *
 * Shared by `deletePlayer`, which a player uses to delete their own account,
 * and the `userDeleted` Auth trigger, which also covers an account deleted
 * from the Firebase console. Every step finds nothing the second time, so
 * running it twice — the callable and then the trigger its Auth deletion
 * fires — is harmless.
 *
 * What stays, on purpose:
 * - **Waiver signatures** (`players/{uid}/waiverSignatures`). A liability
 *   release matters most after someone has left, so it outlives the account;
 *   see docs/WAIVERS.md.
 * - **Team contributions.** The money is the team's, and the ledger is what
 *   settles it; the payer shows as "A teammate".
 * - **Posts and replies** stay on the message board without a name, since
 *   deleting a post would take other people's replies with it.
 */

import type { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
	Collections,
	PLAYER_SEASONS_SUBCOLLECTION,
	type DocumentReference,
	type PlayerDocument,
} from '../types.js'

export interface AccountDeletionSummary {
	rosterEntriesDeleted: number
	playerSeasonsDeleted: number
	offersDeleted: number
	playerDeleted: boolean
}

export async function deletePlayerAccountData(
	firestore: Firestore,
	uid: string
): Promise<AccountDeletionSummary> {
	const playerRef = firestore
		.collection(Collections.PLAYERS)
		.doc(uid) as DocumentReference<PlayerDocument>

	// Roster entries on every team and season, found by reference. This
	// bypasses shared/membership.ts on purpose: that helper keeps the player
	// side in step with the team side, and the player side is deleted next.
	const rosterEntries = await firestore
		.collectionGroup('roster')
		.where('player', '==', playerRef)
		.get()
	for (const entry of rosterEntries.docs) await entry.ref.delete()

	const playerSeasons = await playerRef
		.collection(PLAYER_SEASONS_SUBCOLLECTION)
		.get()
	for (const season of playerSeasons.docs) await season.ref.delete()

	const offers = await firestore
		.collection(Collections.OFFERS)
		.where('player', '==', playerRef)
		.get()
	await Promise.all(offers.docs.map((offer) => offer.ref.delete()))

	// The leaderboard caches the player's name, so their entry goes now
	// rather than at the next rankings rebuild.
	await firestore.collection(Collections.RANKINGS).doc(uid).delete()

	await deleteLocalStripeData(firestore, uid)

	const playerDoc = await playerRef.get()
	if (playerDoc.exists) await playerRef.delete()

	const summary = {
		rosterEntriesDeleted: rosterEntries.size,
		playerSeasonsDeleted: playerSeasons.size,
		offersDeleted: offers.size,
		playerDeleted: playerDoc.exists,
	}
	logger.info('Deleted account data', { uid, ...summary })
	return summary
}

/** The site's copy of Stripe checkouts and payments. Stripe keeps its own. */
async function deleteLocalStripeData(
	firestore: Firestore,
	uid: string
): Promise<void> {
	const stripeDocRef = firestore.collection(Collections.STRIPE).doc(uid)
	for (const sub of ['checkouts', 'payments']) {
		const snapshot = await stripeDocRef.collection(sub).get()
		await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()))
	}
	await stripeDocRef.delete()
}
