import { updateCalculationState } from './calculationState.js'

/**
 * Updates seasonal progress for a calculation
 */
export async function updateSeasonalProgress(
	calculationId: string,
	seasonsProcessed: number,
	totalSeasons: number,
	currentSeasonId?: string
): Promise<void> {
	await updateCalculationState(calculationId, {
		'progress.currentStep': `Processing season ${seasonsProcessed + 1}/${totalSeasons}...`,
		'progress.percentComplete': Math.round(
			(seasonsProcessed / totalSeasons) * 90
		), // Leave 10% for final steps
		'progress.seasonsProcessed': seasonsProcessed,
		...(currentSeasonId && { 'progress.currentSeason': currentSeasonId }),
	})
}

/**
 * Updates overall progress periodically during game processing
 */
export async function updateGameProgress(
	calculationId: string,
	gameIndex: number,
	totalGames: number
): Promise<void> {
	if (gameIndex % 100 === 0) {
		const overallProgress = Math.round((gameIndex / totalGames) * 90)
		await updateCalculationState(calculationId, {
			'progress.percentComplete': overallProgress,
		})
	}
}
