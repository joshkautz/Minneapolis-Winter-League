import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { Collections } from '../../../types.js'
import { TRUESKILL_CONSTANTS } from '../constants.js'

/**
 * Creates a new calculation state document
 */
export async function createCalculationState(
	calculationType: 'fresh',
	userId: string
): Promise<string> {
	const firestore = getFirestore()

	// Drop the explicit Partial<RankingsCalculationDocument> annotation so
	// `FieldValue.serverTimestamp()` can be used in the `startedAt` field —
	// it's the right runtime value but the strict interface type only knows
	// about Timestamp.
	const calculationDoc = {
		calculationType,
		status: 'pending',
		startedAt: FieldValue.serverTimestamp(),
		completedAt: null,
		triggeredBy: userId,
		progress: {
			currentStep: 'Initializing...',
			percentComplete: 0,
			totalSeasons: 0,
			seasonsProcessed: 0,
		},
		parameters: {
			applyDecay: true,
			seasonDecayFactor: TRUESKILL_CONSTANTS.SEASON_DECAY_FACTOR,
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
