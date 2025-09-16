/**
 * Determines if a game should count toward totalGames in calculations
 * For full calculations: count all games (this is correct - we're rebuilding from scratch)
 * For incremental calculations: only count games from the NEW period (at or after start point)
 */
export function shouldCountGame(
	game: { seasonOrder: number; week: number },
	incrementalStartSeasonIndex?: number,
	incrementalStartWeek?: number,
	totalSeasons?: number
): boolean {
	// For full calculations, count all games (this rebuilds totals from scratch)
	if (incrementalStartSeasonIndex === undefined) {
		return true
	}

	// Convert incrementalStartSeasonIndex to seasonOrder for proper comparison
	// incrementalStartSeasonIndex: 0 = oldest season, 1 = next, etc. (chronological order)
	// seasonOrder: 0 = newest season, 1 = previous, etc. (reverse chronological order)
	// Conversion: seasonOrder = (totalSeasons - 1) - seasonIndex
	const startSeasonOrder =
		totalSeasons !== undefined
			? totalSeasons - 1 - incrementalStartSeasonIndex
			: incrementalStartSeasonIndex // fallback to old logic if totalSeasons not provided

	// For incremental calculations, count games that are:
	// 1. From more recent seasons (lower seasonOrder), OR
	// 2. From the same season but at or after the start week
	return (
		game.seasonOrder < startSeasonOrder ||
		(game.seasonOrder === startSeasonOrder &&
			game.week >= (incrementalStartWeek || 0))
	)
}
