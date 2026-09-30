import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { Collections } from '../../../types.js'
import { TRUESKILL_CONSTANTS } from '../constants.js'

/** Recorded on each calculation, so a result can be traced to its rules. */
const ALGORITHM_VERSION = 'v6'

/**
 * Creates a new calculation state document
 *
 * @param triggeredBy the admin's uid, or 'schedule'
 */
export async function createCalculationState(
	triggeredBy: string
): Promise<string> {
	const firestore = getFirestore()

	// Not annotated as RankingsCalculationDocument: `startedAt` is a
	// serverTimestamp sentinel, which the interface only knows as Timestamp.
	const calculationDoc = {
		calculationType: 'fresh',
		status: 'pending',
		startedAt: FieldValue.serverTimestamp(),
		completedAt: null,
		triggeredBy,
		progress: {
			currentStep: 'Initializing...',
			percentComplete: 0,
			totalSeasons: 0,
			totalGames: 0,
		},
		parameters: {
			algorithmVersion: ALGORITHM_VERSION,
			seasonCarryOver: TRUESKILL_CONSTANTS.SEASON_CARRY_OVER,
			playoffMultiplier: TRUESKILL_CONSTANTS.PLAYOFF_MULTIPLIER,
		},
	}

	const docRef = await firestore
		.collection(Collections.RANKINGS_CALCULATIONS)
		.add(calculationDoc)

	return docRef.id
}

/**
 * Updates calculation state.
 *
 * Type-loose `updates` so callers can pass `FieldValue.serverTimestamp()`
 * for timestamp fields without fighting the strict
 * `Partial<RankingsCalculationDocument>` shape (which only knows about
 * concrete `Timestamp`).
 */
export async function updateCalculationState(
	calculationId: string,
	updates: { [key: string]: unknown }
): Promise<void> {
	const firestore = getFirestore()
	await firestore
		.collection(Collections.RANKINGS_CALCULATIONS)
		.doc(calculationId)
		.update(updates)
}
