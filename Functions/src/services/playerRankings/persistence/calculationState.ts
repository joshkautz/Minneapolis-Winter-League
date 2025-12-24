import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { Collections, RankingsCalculationDocument } from '../../../types.js'
import { TRUESKILL_CONSTANTS } from '../constants.js'

/**
 * Creates a new calculation state document
 */
export async function createCalculationState(
	calculationType: 'fresh',
	userId: string
): Promise<string> {
	const firestore = getFirestore()

	const calculationDoc: Partial<RankingsCalculationDocument> = {
		calculationType,
		status: 'pending',
		startedAt: Timestamp.now(),
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
 * Updates calculation state
 */
export async function updateCalculationState(
	calculationId: string,
	updates: Partial<RankingsCalculationDocument>
): Promise<void> {
	const firestore = getFirestore()
	await firestore
		.collection(Collections.RANKINGS_CALCULATIONS)
		.doc(calculationId)
		.update(updates)
}
