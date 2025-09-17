// Re-export all public APIs from the modular structure
export { ALGORITHM_CONSTANTS } from './constants.js'
export * from './types.js'

// Core algorithms
export { calculateExpectedScore } from './algorithms/elo.js'
export { calculateWeightedPointDifferential } from './algorithms/pointDifferential.js'
export { calculateTeamStrength } from './algorithms/teamStrength.js'
export { applyInactivityDecay } from './algorithms/decay.js'

// Game processing (round-based only)
export { loadGamesForCalculation } from './gameProcessing/gameLoader.js'
export {
	processGame,
	processPlayersInGame,
} from './gameProcessing/gameProcessor.js'
export {
	groupGamesByRounds,
	formatRoundInfo,
} from './gameProcessing/roundGrouper.js'
export {
	processGamesByRounds,
	processNewRoundsOnly,
} from './gameProcessing/roundProcessor.js'

// Incremental calculations (only needed for new rounds)
export { convertSnapshotToRatings } from './incremental/snapshotConverter.js'
export { shouldCountGame } from './incremental/gameCounter.js'

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
export {
	loadExistingRankings,
	hasExistingRankings,
} from './persistence/existingRankingsLoader.js'

// Round tracking (key for new rounds detection)
export {
	isRoundCalculated,
	markRoundCalculated,
	getLastCalculatedRoundTime,
	filterUncalculatedRounds,
	getCalculatedRoundsForSeason,
} from './persistence/roundTracker.js'
