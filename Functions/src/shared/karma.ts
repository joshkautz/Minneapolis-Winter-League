/**
 * Karma transaction utilities
 * Handles creation and querying of karma transactions for teams
 */

import { Timestamp } from 'firebase-admin/firestore'
import {
	DocumentReference,
	KarmaTransaction,
	PlayerDocument,
	TeamDocument,
	SeasonDocument,
	PlayerSeason,
} from '../types.js'

const KARMA_AMOUNT = 100

/**
 * Creates a karma transaction record in the team's subcollection
 */
export async function createKarmaTransaction(
	transaction: FirebaseFirestore.Transaction,
	teamRef: DocumentReference<TeamDocument>,
	playerRef: DocumentReference<PlayerDocument>,
	seasonRef: DocumentReference<SeasonDocument>,
	amount: number,
	reason: 'player_joined' | 'player_left'
): Promise<void> {
	const karmaTransactionRef = teamRef
		.collection('karma_transactions')
		.doc() as DocumentReference<KarmaTransaction>

	const karmaTransactionData: KarmaTransaction = {
		player: playerRef,
		team: teamRef,
		amount,
		reason,
		timestamp: Timestamp.now(),
		season: seasonRef,
	}

	transaction.set(karmaTransactionRef, karmaTransactionData)
}

/**
 * Checks if a team was awarded karma when a specific player joined
 * Returns the transaction if found, null otherwise
 */
export async function findKarmaTransactionForPlayerJoin(
	teamRef: DocumentReference<TeamDocument>,
	playerRef: DocumentReference<PlayerDocument>,
	seasonRef: DocumentReference<SeasonDocument>
): Promise<KarmaTransaction | null> {
	const snapshot = await teamRef
		.collection('karma_transactions')
		.where('player', '==', playerRef)
		.where('season', '==', seasonRef)
		.where('reason', '==', 'player_joined')
		.where('amount', '>', 0)
		.limit(1)
		.get()

	if (snapshot.empty) {
		return null
	}

	return snapshot.docs[0].data() as KarmaTransaction
}

/**
 * Checks if a player is fully registered for a season
 */
export function isPlayerFullyRegistered(
	playerSeasonData: PlayerSeason
): boolean {
	return Boolean(playerSeasonData?.paid && playerSeasonData?.signed)
}

/**
 * Checks if a player qualifies for karma bonus
 * Requirements: lookingForTeam=true and fully registered
 */
export function qualifiesForKarmaBonus(
	playerSeasonData: PlayerSeason
): boolean {
	const isLookingForTeam = playerSeasonData?.lookingForTeam || false
	const isFullyRegistered = isPlayerFullyRegistered(playerSeasonData)

	return isLookingForTeam && isFullyRegistered
}

export { KARMA_AMOUNT }
