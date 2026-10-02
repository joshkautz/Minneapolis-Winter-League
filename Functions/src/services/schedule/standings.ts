/**
 * Who finished where: the regular season's seeds and each pool's order.
 *
 * Pure functions over scored games, so the rules can be read and tested on
 * their own. A game that ended level is a win for neither team.
 */

/** A game with both teams and both scores. */
export interface ScoredGame {
	homeTeamId: string
	awayTeamId: string
	homeScore: number
	awayScore: number
}

/** A team, with what the last tiebreakers need. */
export interface SeedableTeam {
	teamId: string
	/** When it registered, the final tiebreaker. Null sorts last. */
	registeredDate: Date | null
	/** Its rostered players' average rating. Null if none is rated. */
	rating: number | null
}

export interface TeamRecord {
	wins: number
	losses: number
	differential: number
	pointsFor: number
}

const emptyRecord = (): TeamRecord => ({
	wins: 0,
	losses: 0,
	differential: 0,
	pointsFor: 0,
})

/** Each team's record over `games`, counting only games among `teamIds`. */
export function recordsOf(
	teamIds: readonly string[],
	games: readonly ScoredGame[]
): Map<string, TeamRecord> {
	const records = new Map(teamIds.map((id) => [id, emptyRecord()]))
	for (const game of games) {
		const home = records.get(game.homeTeamId)
		const away = records.get(game.awayTeamId)
		if (!home || !away) continue
		home.pointsFor += game.homeScore
		away.pointsFor += game.awayScore
		home.differential += game.homeScore - game.awayScore
		away.differential += game.awayScore - game.homeScore
		if (game.homeScore > game.awayScore) {
			home.wins++
			away.losses++
		} else if (game.awayScore > game.homeScore) {
			away.wins++
			home.losses++
		}
	}
	return records
}

/** Descending order of a number, for a comparator chain. */
const higherFirst = (a: number, b: number): number => b - a

/**
 * The regular season's seeds, best first: wins, then point differential —
 * the order the Standings page shows — then, among teams still level, wins
 * in the games between them, points scored, the roster's average player
 * rating, and finally who registered first.
 */
export function seedTeams(
	teams: readonly SeedableTeam[],
	games: readonly ScoredGame[]
): string[] {
	const ids = teams.map((team) => team.teamId)
	const records = recordsOf(ids, games)
	const record = (id: string): TeamRecord => records.get(id) ?? emptyRecord()
	const byId = new Map(teams.map((team) => [team.teamId, team]))

	const level = new Map<string, string[]>()
	for (const id of ids) {
		const { wins, differential } = record(id)
		const key = `${wins}:${differential}`
		level.set(key, [...(level.get(key) ?? []), id])
	}
	const headToHeadWins = new Map<string, number>()
	for (const group of level.values()) {
		if (group.length < 2) continue
		for (const [id, { wins }] of recordsOf(group, games)) {
			headToHeadWins.set(id, wins)
		}
	}

	return [...ids].sort((a, b) => {
		const ra = record(a)
		const rb = record(b)
		const ta = byId.get(a)
		const tb = byId.get(b)
		return (
			higherFirst(ra.wins, rb.wins) ||
			higherFirst(ra.differential, rb.differential) ||
			higherFirst(headToHeadWins.get(a) ?? 0, headToHeadWins.get(b) ?? 0) ||
			higherFirst(ra.pointsFor, rb.pointsFor) ||
			higherFirst(
				ta?.rating ?? Number.NEGATIVE_INFINITY,
				tb?.rating ?? Number.NEGATIVE_INFINITY
			) ||
			(ta?.registeredDate?.getTime() ?? Number.POSITIVE_INFINITY) -
				(tb?.registeredDate?.getTime() ?? Number.POSITIVE_INFINITY) ||
			a.localeCompare(b)
		)
	})
}

/**
 * A pool's order, first to third: wins in the pool, then point differential
 * in the pool, then regular-season seed. `members` is in seed order.
 */
export function rankPool(
	members: readonly string[],
	games: readonly ScoredGame[]
): string[] {
	const records = recordsOf(members, games)
	const seedOf = new Map(members.map((id, index) => [id, index]))
	return [...members].sort((a, b) => {
		const ra = records.get(a) ?? emptyRecord()
		const rb = records.get(b) ?? emptyRecord()
		return (
			higherFirst(ra.wins, rb.wins) ||
			higherFirst(ra.differential, rb.differential) ||
			(seedOf.get(a) ?? 0) - (seedOf.get(b) ?? 0)
		)
	})
}

/** The winner and loser of a scored game, or null if it ended level. */
export function decided(
	game: ScoredGame
): { winner: string; loser: string } | null {
	if (game.homeScore === game.awayScore) return null
	return game.homeScore > game.awayScore
		? { winner: game.homeTeamId, loser: game.awayTeamId }
		: { winner: game.awayTeamId, loser: game.homeTeamId }
}
