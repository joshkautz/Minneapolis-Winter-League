import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { Collections, RankingsCalculationDocument } from '../../../types.js'
import { ALGORITHM_CONSTANTS } from '../constants.js'

/**
 * Creates a new calculation state document
 */
export async function createCalculationState(
	calculationType: 'full' | 'incremental' | 'round-based',
	userId: string,
	parameters: any
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
			applyDecay: parameters.applyDecay ?? true,
			seasonDecayFactor: ALGORITHM_CONSTANTS.SEASON_DECAY_FACTOR,
			playoffMultiplier: ALGORITHM_CONSTANTS.PLAYOFF_MULTIPLIER,
			kFactor: ALGORITHM_CONSTANTS.K_FACTOR,
			// Only include defined values to avoid Firestore undefined value errors
			...(parameters.startSeasonId !== undefined && {
				startSeasonId: parameters.startSeasonId,
			}),
			...(parameters.startWeek !== undefined && {
				startWeek: parameters.startWeek,
			}),
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
