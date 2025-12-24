// Re-export all public APIs from the modular structure
export {
	TRUESKILL_CONSTANTS,
	RATING_PRECISION_MULTIPLIER,
} from './constants.js'
export * from './types.js'

// Core algorithms - TrueSkill
export { updateRatings, type TrueSkillRating } from './algorithms/trueskill.js'
export {
	applyRoundBasedDecay,
	initializePlayerRoundTracking,
} from './algorithms/decay.js'

// Game processing (round-based, full rebuild only)
export { loadGamesForCalculation } from './gameProcessing/gameLoader.js'
export { processGame } from './gameProcessing/gameProcessor.js'
export {
	groupGamesByRounds,
	formatRoundInfo,
} from './gameProcessing/roundGrouper.js'
export { processGamesByRounds } from './gameProcessing/roundProcessor.js'

// Snapshots and progress tracking
export { createTimeBasedSnapshot } from './snapshots/snapshotCreator.js'
export { saveRoundSnapshot } from './snapshots/roundSnapshotSaver.js'

// Persistence
export {
	createCalculationState,
	updateCalculationState,
} from './persistence/calculationState.js'
export {
	updateProgress,
	updateSeasonalProgress,
	updateGameProgress,
} from './persistence/progressTracker.js'
export { saveFinalRankings } from './persistence/rankingsSaver.js'
