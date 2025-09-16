import { Timestamp } from 'firebase-admin/firestore'

/**
 * Calculates week number within a season based on game date
 */
export function calculateWeekNumber(
	gameDate: Timestamp,
	seasonStart: Timestamp
): number {
	const gameTime = gameDate.toDate().getTime()
	const seasonStartTime = seasonStart.toDate().getTime()
	const weeksDiff = Math.floor(
		(gameTime - seasonStartTime) / (7 * 24 * 60 * 60 * 1000)
	)
	return Math.max(1, weeksDiff + 1)
}
