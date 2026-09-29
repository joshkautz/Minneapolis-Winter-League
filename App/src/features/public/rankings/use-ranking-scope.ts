/**
 * Which rankings are being looked at: all time, or one season's. The choice
 * lives in the URL (`?season=<id>`), so a season's leaderboard or a player's
 * season can be linked to, and the leaderboard hands it on to the player
 * pages it links.
 */

import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/** The season being looked at, or null for all time. */
export const useRankingScope = (): {
	seasonId: string | null
	setSeasonId: (seasonId: string | null) => void
} => {
	const [params, setParams] = useSearchParams()
	const setSeasonId = useCallback(
		(seasonId: string | null) =>
			setParams(
				(current) => {
					const next = new URLSearchParams(current)
					if (seasonId) next.set('season', seasonId)
					else next.delete('season')
					return next
				},
				{ replace: true }
			),
		[setParams]
	)
	return { seasonId: params.get('season'), setSeasonId }
}

/** The query string that keeps the scope when linking to a player. */
export const scopeQuery = (seasonId: string | null): string =>
	seasonId ? `?season=${encodeURIComponent(seasonId)}` : ''
