/**
 * The order the Standings page lists teams in, and how many weeks each part
 * of the season spans.
 */

import type { QuerySnapshot } from 'firebase/firestore'
import { canonicalTeamIdFromTeamSeasonDoc } from '@/firebase/collections/teams'
import type { TeamStanding } from '@/shared/hooks'
import type { GameDocument, TeamSeasonDocument } from '@/types'
import { LEAGUE_TIME_ZONE } from '@/shared/game-rules'

/** Each team's `standingsRank`, for those that have one. */
export const standingsRanks = (
	teams: QuerySnapshot<TeamSeasonDocument> | undefined
): Map<string, number> =>
	new Map(
		(teams?.docs ?? []).flatMap((doc) => {
			const rank = doc.data().standingsRank
			return typeof rank === 'number'
				? [[canonicalTeamIdFromTeamSeasonDoc(doc), rank] as const]
				: []
		})
	)

const NO_GAMES: TeamStanding = {
	pointsFor: 0,
	pointsAgainst: 0,
	wins: 0,
	losses: 0,
	differential: 0,
}

/**
 * The standings with a 0–0 row for every ranked team yet to play, so a
 * generated season lists all its teams before the first game.
 */
export const withRankedTeams = (
	standings: Record<string, TeamStanding>,
	ranks: ReadonlyMap<string, number>
): Record<string, TeamStanding> => {
	const all = { ...standings }
	for (const teamId of ranks.keys()) all[teamId] ??= NO_GAMES
	return all
}

/**
 * Orders standings by `standingsRank` when both teams have one — the
 * server's order, with every seeding tiebreaker — and otherwise by wins,
 * then point differential.
 */
export const byStandings =
	(ranks: ReadonlyMap<string, number>) =>
	(a: [string, TeamStanding], b: [string, TeamStanding]): number => {
		const rankA = ranks.get(a[0])
		const rankB = ranks.get(b[0])
		if (rankA !== undefined && rankB !== undefined) return rankA - rankB
		return b[1].wins - a[1].wins || b[1].differential - a[1].differential
	}

/** How many nights a season's games are played on, on Minneapolis's calendar. */
export const nightsIn = (
	games: QuerySnapshot<GameDocument> | undefined
): number =>
	new Set(
		(games?.docs ?? []).map((doc) =>
			doc.data().date.toDate().toLocaleDateString('en-CA', {
				timeZone: LEAGUE_TIME_ZONE,
			})
		)
	).size

/** "Week 5", or "Weeks 1–4". */
export const weeksLabel = (first: number, count: number): string =>
	count <= 1 ? `Week ${first}` : `Weeks ${first}–${first + count - 1}`
