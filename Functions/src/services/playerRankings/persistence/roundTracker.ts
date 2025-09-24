import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { Collections } from '../../../types.js'
import { GameRound } from '../gameProcessing/roundGrouper.js'

/**
 * Document structure for tracking calculated rounds
 */
export interface CalculatedRoundDocument {
	/** Unique round identifier */
	roundId: string
	/** Timestamp when this round's games started */
	roundStartTime: Timestamp
	/** Season ID */
	seasonId: string
	/** Number of games in this round */
	gameCount: number
	/** When this round was calculated */
	calculatedAt: Timestamp
	/** ID of the calculation that processed this round */
	calculationId: string
	/** Game IDs that were processed in this round */
	gameIds: string[]
}

/**
 * Checks if a round has already been calculated
 */
export async function isRoundCalculated(roundId: string): Promise<boolean> {
	const firestore = getFirestore()

	const roundDoc = await firestore
		.collection(Collections.RANKINGS_CALCULATED_ROUNDS)
		.doc(roundId)
		.get()

	return roundDoc.exists
}

/**
 * Marks a round as calculated
 */
export async function markRoundCalculated(
	round: GameRound,
	calculationId: string
): Promise<void> {
	const firestore = getFirestore()

	const roundDoc: CalculatedRoundDocument = {
		roundId: round.roundId,
		roundStartTime: Timestamp.fromDate(round.startTime),
		seasonId: round.seasonId,
		gameCount: round.games.length,
		calculatedAt: Timestamp.now(),
		calculationId,
		gameIds: round.games.map((game) => game.id),
	}

	await firestore
		.collection(Collections.RANKINGS_CALCULATED_ROUNDS)
		.doc(round.roundId)
		.set(roundDoc)
}

/**
 * Gets the last calculated round timestamp for incremental calculations
 */
export async function getLastCalculatedRoundTime(): Promise<Date | null> {
	const firestore = getFirestore()

	const lastRoundQuery = await firestore
		.collection(Collections.RANKINGS_CALCULATED_ROUNDS)
		.orderBy('roundStartTime', 'desc')
		.limit(1)
		.get()

	if (lastRoundQuery.empty) {
		return null
	}

	const lastRound = lastRoundQuery.docs[0].data() as CalculatedRoundDocument
	return lastRound.roundStartTime.toDate()
}

/**
 * Filters rounds to only include those that haven't been calculated yet
 */
export async function filterUncalculatedRounds(
	rounds: GameRound[]
): Promise<GameRound[]> {
	const uncalculatedRounds: GameRound[] = []

	for (const round of rounds) {
		const isCalculated = await isRoundCalculated(round.roundId)
		if (!isCalculated) {
			uncalculatedRounds.push(round)
		}
	}

	return uncalculatedRounds
}

/**
 * Gets all calculated rounds for a specific season (for debugging/reporting)
 */
export async function getCalculatedRoundsForSeason(
	seasonId: string
): Promise<CalculatedRoundDocument[]> {
	const firestore = getFirestore()

	const roundsSnapshot = await firestore
		.collection(Collections.RANKINGS_CALCULATED_ROUNDS)
		.where('seasonId', '==', seasonId)
		.orderBy('roundStartTime', 'asc')
		.get()

	return roundsSnapshot.docs.map((doc) => doc.data() as CalculatedRoundDocument)
}
