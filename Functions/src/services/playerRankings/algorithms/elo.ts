/**
 * Calculates the expected score for player A against player B using Elo formula
 */
export function calculateExpectedScore(
	ratingA: number,
	ratingB: number
): number {
	return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}
