import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { Collections, GameDocument, SeasonDocument } from '../../../types.js'
import { GameProcessingData } from '../types.js'

/**
 * Loads all games for calculation starting from specified season
 */
export async function loadGamesForCalculation(
	seasons: (SeasonDocument & { id: string })[],
	startSeasonIndex: number
): Promise<GameProcessingData[]> {
	const firestore = getFirestore()
	const allGames: GameProcessingData[] = []

	logger.info(
		`Loading games from ${seasons.length - startSeasonIndex} seasons (starting from index ${startSeasonIndex})`
	)

	for (let i = startSeasonIndex; i < seasons.length; i++) {
		const season = seasons[i]
		const seasonRef = firestore.collection(Collections.SEASONS).doc(season.id)

		const gamesSnapshot = await firestore
			.collection(Collections.GAMES)
			.where('season', '==', seasonRef)
			.orderBy('date', 'asc')
			.get()

		logger.info(`Season ${season.id}: Found ${gamesSnapshot.docs.length} games`)

		const seasonGames = gamesSnapshot.docs.map((doc) => {
			const gameData = doc.data() as GameDocument
			return {
				id: doc.id,
				...gameData,
				seasonOrder: seasons.length - 1 - i, // 0 = most recent
				gameDate: gameData.date.toDate(),
			} as GameProcessingData
		})

		const completedGames = seasonGames.filter(
			(game) => game.homeScore !== null && game.awayScore !== null
		)

		logger.info(
			`Season ${season.id}: ${completedGames.length} completed games after filtering`
		)
		allGames.push(...completedGames)
	}

	// Sort all games by date to ensure chronological processing
	allGames.sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime())

	return allGames
}
