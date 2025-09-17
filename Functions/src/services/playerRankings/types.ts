import { GameDocument } from '../../types.js'

export interface GameProcessingData extends GameDocument {
	id: string
	seasonOrder: number // 0 = most recent season, 1 = previous, etc.
	gameDate: Date
}

export interface PlayerRatingState {
	playerId: string
	playerName: string
	currentRating: number
	totalGames: number
	totalSeasons: number
	seasonsPlayed: Set<string> // Track which seasons player has participated in
	lastSeasonId: string | null
	isActive: boolean
}

export interface TeamStrength {
	teamId: string
	averageRating: number
	playerCount: number
	confidence: number // 0-1, based on how many rated players
}

export interface IncrementalStartPoint {
	seasonIndex: number
	playerRatings: Map<string, PlayerRatingState>
}
