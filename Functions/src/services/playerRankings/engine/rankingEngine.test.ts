import { describe, expect, it } from 'vitest'
import { TRUESKILL_CONSTANTS } from '../constants.js'
import {
	rosterKey,
	runRankings,
	type EngineGame,
	type EngineInput,
} from './rankingEngine.js'

/** The value, failing the test by name when it is missing. */
const must = <T>(value: T | null | undefined): T => {
	if (value === undefined || value === null) throw new Error('missing value')
	return value
}

const BASELINE = TRUESKILL_CONSTANTS.INITIAL_MU

let gameCount = 0
const game = (
	seasonId: string,
	date: string,
	home: string,
	away: string,
	overrides: Partial<EngineGame> = {}
): EngineGame => ({
	id: `game-${++gameCount}`,
	seasonId,
	date: new Date(date),
	type: 'regular',
	homeTeamId: home,
	awayTeamId: away,
	homeScore: 15,
	awayScore: 10,
	...overrides,
})

/** Teams named by their only player: team `a` is player `a`. */
const league = (
	games: EngineGame[],
	extraRosters: [string, string, string[]][] = []
): EngineInput => {
	const rosters = new Map<string, string[]>()
	const names = new Map<string, string>()
	for (const g of games) {
		for (const team of [g.homeTeamId, g.awayTeamId]) {
			if (!team) continue
			rosters.set(rosterKey(team, g.seasonId), [team])
			names.set(team, `Player ${team}`)
		}
	}
	for (const [team, seasonId, players] of extraRosters) {
		rosters.set(rosterKey(team, seasonId), players)
		for (const player of players) names.set(player, `Player ${player}`)
	}
	return { games, rosters, playerNames: names }
}

const muOf = (input: EngineInput, playerId: string): number | undefined =>
	runRankings(input).players.get(playerId)?.mu

describe('runRankings', () => {
	it('rates the winner up and the loser down', () => {
		const input = league([game('s1', '2030-01-05T18:00:00Z', 'a', 'b')])
		expect(muOf(input, 'a')).toBeGreaterThan(BASELINE)
		expect(muOf(input, 'b')).toBeLessThan(BASELINE)
	})

	it('counts a tie as an away win', () => {
		const input = league([
			game('s1', '2030-01-05T18:00:00Z', 'a', 'b', {
				homeScore: 12,
				awayScore: 12,
			}),
		])
		expect(muOf(input, 'b')).toBeGreaterThan(must(muOf(input, 'a')))
	})

	it('ignores games without both scores', () => {
		const input = league([
			game('s1', '2030-01-05T18:00:00Z', 'a', 'b'),
			game('s1', '2030-01-12T18:00:00Z', 'b', 'a', {
				homeScore: null,
				awayScore: null,
			}),
		])
		const result = runRankings(input)
		expect(result.rounds).toHaveLength(1)
		expect(result.players.get('a')?.totalGames).toBe(1)
	})

	it('groups games that start together into one round', () => {
		const input = league([
			game('s1', '2030-01-05T18:00:00Z', 'a', 'b'),
			game('s1', '2030-01-05T18:00:00Z', 'c', 'd'),
			game('s1', '2030-01-05T19:00:00Z', 'a', 'c'),
		])
		const rounds = runRankings(input).rounds
		expect(rounds.map((round) => round.gameIds.length)).toEqual([2, 1])
	})

	it('weights a playoff game more than a regular one', () => {
		const input = league([
			game('s1', '2030-01-05T18:00:00Z', 'reg', 'reg-loser'),
			game('s1', '2030-01-05T18:00:00Z', 'post', 'post-loser', {
				type: 'playoff',
			}),
		])
		expect(muOf(input, 'post')).toBeGreaterThan(must(muOf(input, 'reg')))
	})

	it('skips a game whose team has no roster', () => {
		const games = [game('s1', '2030-01-05T18:00:00Z', 'a', 'b')]
		const input = league(games)
		input.rosters = new Map([[rosterKey('a', 's1'), ['a']]])
		const result = runRankings(input)
		expect(result.players.size).toBe(0)
	})

	it('leaves out a rostered player with no name', () => {
		const input = league([game('s1', '2030-01-05T18:00:00Z', 'a', 'b')])
		input.playerNames = new Map([['a', 'Player a']])
		expect(runRankings(input).players.has('b')).toBe(false)
	})

	it('carries a rating into the next season at part of its distance from the baseline', () => {
		const firstSeason = [game('s1', '2030-01-05T18:00:00Z', 'a', 'b')]
		const before = must(muOf(league(firstSeason), 'a'))
		// `a` sits out the next season's only round, so after the carry-over
		// only the inactivity decay acts on them.
		const input = league([
			...firstSeason,
			game('s2', '2031-01-05T18:00:00Z', 'c', 'd'),
		])
		const carried =
			BASELINE + (before - BASELINE) * TRUESKILL_CONSTANTS.SEASON_CARRY_OVER
		const decayed =
			BASELINE +
			(carried - BASELINE) * TRUESKILL_CONSTANTS.INACTIVITY_DECAY_PER_ROUND
		expect(muOf(input, 'a')).toBeCloseTo(decayed, 10)
	})

	it('pulls a winner back toward the baseline when a new season starts', () => {
		// The same second round, played as the next season or as more of the
		// same one: only the season change differs.
		const first = game('s1', '2030-01-05T18:00:00Z', 'a', 'b')
		const nextSeason = muOf(
			league([first, game('s2', '2031-01-05T18:00:00Z', 'c', 'd')]),
			'a'
		)
		const sameSeason = muOf(
			league([first, game('s1', '2031-01-05T18:00:00Z', 'c', 'd')]),
			'a'
		)
		expect(must(nextSeason)).toBeLessThan(must(sameSeason))
		expect(must(nextSeason)).toBeGreaterThan(BASELINE)
	})

	it('does not carry over between rounds of the same season', () => {
		const input = league([
			game('s1', '2030-01-05T18:00:00Z', 'a', 'b'),
			game('s1', '2030-01-12T18:00:00Z', 'c', 'd'),
		])
		const afterFirst = must(
			muOf(league([game('s1', '2030-01-05T18:00:00Z', 'a', 'b')]), 'a')
		)
		expect(muOf(input, 'a')).toBeCloseTo(
			BASELINE +
				(afterFirst - BASELINE) *
					TRUESKILL_CONSTANTS.INACTIVITY_DECAY_PER_ROUND,
			10
		)
	})

	it('never changes a past round when a later season is added', () => {
		// The reason for v6: v5 discounted each game by how many seasons ago
		// it was, counted at rebuild time, so creating a season re-wrote
		// every rating before it.
		const past = [
			game('s1', '2030-01-05T18:00:00Z', 'a', 'b'),
			game('s1', '2030-01-12T18:00:00Z', 'b', 'a'),
		]
		const before = runRankings(league(past)).rounds
		const after = runRankings(
			league([...past, game('s2', '2031-01-05T18:00:00Z', 'a', 'b')])
		).rounds

		expect(after.slice(0, before.length)).toEqual(before)
	})

	it("keeps each player's games and wins per season", () => {
		const input = league([
			game('s1', '2030-01-05T18:00:00Z', 'a', 'b'),
			game('s1', '2030-01-12T18:00:00Z', 'b', 'a'),
			game('s1', '2030-01-19T18:00:00Z', 'a', 'b'),
			game('s2', '2031-01-05T18:00:00Z', 'b', 'a'),
		])
		const records = runRankings(input).seasonRecords
		expect(records.get('s1')?.get('a')).toEqual({ games: 3, wins: 2 })
		expect(records.get('s2')?.get('a')).toEqual({ games: 1, wins: 0 })
	})

	it('credits a whole roster with its games', () => {
		const input = league(
			[game('s1', '2030-01-05T18:00:00Z', 'team-a', 'b')],
			[['team-a', 's1', ['a1', 'a2']]]
		)
		const players = runRankings(input).players
		expect(players.get('a1')?.mu).toBe(players.get('a2')?.mu)
		expect(players.get('a1')?.totalGames).toBe(1)
	})
})
