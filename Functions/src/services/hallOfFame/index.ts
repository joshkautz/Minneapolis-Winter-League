// Re-export all public APIs from the modular structure
export { ALGORITHM_CONSTANTS } from './constants.js'
export * from './types.js'

// Core algorithms
export { calculateExpectedScore } from './algorithms/elo.js'
export { calculateWeightedPointDifferential } from './algorithms/pointDifferential.js'
export { calculateTeamStrength } from './algorithms/teamStrength.js'
export { applyInactivityDecay } from './algorithms/decay.js'

// Game processing
export { loadGamesForCalculation } from './gameProcessing/gameLoader.js'
export {
	processGame,
	processPlayersInGame,
} from './gameProcessing/gameProcessor.js'
export { processGamesChronologically } from './gameProcessing/chronologicalProcessor.js'
export { calculateWeekNumber } from './gameProcessing/weekCalculator.js'
export {
	groupGamesByRounds,
	formatRoundInfo,
} from './gameProcessing/roundGrouper.js'
export {
	processGamesByRounds,
	processNewRoundsOnly,
} from './gameProcessing/roundProcessor.js'

// Incremental calculations
export { determineIncrementalStartPoint } from './incremental/startPointDeterminer.js'
export { convertSnapshotToRatings } from './incremental/snapshotConverter.js'
export { shouldCountGame } from './incremental/gameCounter.js'

// Snapshots
export { createWeeklySnapshot } from './snapshots/snapshotCreator.js'
export { saveWeeklySnapshot } from './snapshots/snapshotSaver.js'
export { calculateWeeklyStats } from './snapshots/statsCalculator.js'

// Persistence
export {
	calculatePlayerRankings,
	saveFinalRankings,
} from './persistence/rankingsSaver.js'
export {
	createCalculationState,
	updateCalculationState,
} from './persistence/calculationState.js'
export {
	updateProgress,
	updateSeasonalProgress,
	updateGameProgress,
} from './persistence/progressTracker.js'
export {
	isRoundCalculated,
	markRoundCalculated,
	getLastCalculatedRoundTime,
	filterUncalculatedRounds,
	getCalculatedRoundsForSeason,
} from './persistence/roundTracker.js'
