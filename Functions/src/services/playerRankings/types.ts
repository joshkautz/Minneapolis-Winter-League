import { GameDocument, PlayerSeasonStats } from '../../types.js'

export interface GameProcessingData extends GameDocument {
	id: string
	seasonOrder: number // 0 = most recent season, 1 = previous, etc.
	week: number
	gameDate: Date
}

export interface PlayerRatingState {
	playerId: string
	playerName: string
	currentRating: number
	totalGames: number
	seasonStats: Map<string, PlayerSeasonStats>
	lastSeasonId: string | null
	isActive: boolean
}

export interface TeamStrength {
	teamId: string
	averageRating: number
	playerCount: number
	confidence: number // 0-1, based on how many rated players
}

export interface WeeklyStats {
	gamesPlayed: number
	pointDifferential: number
}

export interface IncrementalStartPoint {
	seasonIndex: number
	week: number
	playerRatings: Map<string, PlayerRatingState>
}
