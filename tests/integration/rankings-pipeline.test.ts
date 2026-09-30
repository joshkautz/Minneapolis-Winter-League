import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
} from './helpers.js'
import {
	rebuildPlayerRankings,
	rebuildRankingsNightly,
} from '../../Functions/src/index.js'
import {
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'
import { TRUESKILL_CONSTANTS } from '../../Functions/src/services/playerRankings/constants.js'
import type { CallableRequest } from 'firebase-functions/v2/https'

/**
 * The rankings rebuild is the longest chain in the codebase: load games and
 * rosters, group games into rounds, decay, run TrueSkill, then write the
 * leaderboard, every player's history, every season's standings and the
 * per-round snapshots. The TrueSkill maths has unit
 * tests; everything wrapped around it did not, which is how the pipeline came
 * to be reading rosters from a field the 2026 migration deleted — producing
 * empty rankings without failing.
 *
 * These tests drive the real callable against the emulator so the whole chain
 * runs, and assert on what is persisted rather than on intermediate state.
 */

const ADMIN = 'admin-uid'
const INITIAL_MU = TRUESKILL_CONSTANTS.INITIAL_MU

let firestore: Firestore

const seasonRef = (seasonId: string) =>
	firestore.collection('seasons').doc(seasonId)
const teamRef = (teamId: string) => firestore.collection('teams').doc(teamId)
const playerRef = (playerId: string) =>
	firestore.collection('players').doc(playerId)

/** Creates a season. Seasons are ordered by dateStart, oldest first. */
const seedSeason = async (seasonId: string, startIso: string) => {
	await seasonRef(seasonId).set({
		name: seasonId,
		dateStart: Timestamp.fromDate(new Date(startIso)),
		dateEnd: Timestamp.fromDate(new Date(startIso)),
	})
}

/**
 * Creates a player, a team-season for `teamId`, and puts the player on that
 * season's roster subcollection — the shape `updateRoster` writes in
 * production.
 */
const seedTeamWithRoster = async (
	teamId: string,
	seasonId: string,
	playerIds: string[]
) => {
	await teamRef(teamId).set({ createdAt: Timestamp.now(), createdBy: null })
	await teamSeasonRef(firestore, teamId, seasonId).set({
		season: seasonRef(seasonId),
		name: teamId,
		logo: null,
		storagePath: null,
		registered: true,
		registeredDate: Timestamp.now(),
		placement: null,
	})
	for (const playerId of playerIds) {
		await playerRef(playerId).set({
			admin: false,
			firstname: playerId,
			lastname: 'Player',
		})
		await teamRosterEntryRef(firestore, teamId, seasonId, playerId).set({
			player: playerRef(playerId),
			dateJoined: Timestamp.now(),
		})
	}
}

const seedGame = async (
	gameId: string,
	options: {
		seasonId: string
		home: string
		away: string
		homeScore: number | null
		awayScore: number | null
		date: string
		type?: 'regular' | 'playoff'
	}
) => {
	await firestore
		.collection('games')
		.doc(gameId)
		.set({
			season: seasonRef(options.seasonId),
			home: teamRef(options.home),
			away: teamRef(options.away),
			homeName: options.home,
			awayName: options.away,
			homeScore: options.homeScore,
			awayScore: options.awayScore,
			date: Timestamp.fromDate(new Date(options.date)),
			field: 1,
			type: options.type ?? 'regular',
		})
}

const rebuild = async () =>
	(await rebuildPlayerRankings.run({
		auth: authed(ADMIN),
		data: {},
	} as unknown as CallableRequest<never>)) as {
		calculationId: string
		status: string
		message: string
	}

const rankings = async () => {
	const snapshot = await firestore.collection('rankings').get()
	return new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]))
}

const historyCount = async () =>
	(await firestore.collection('player-ranking-history').count().get()).data()
		.count

const playerHistory = async (playerId: string) =>
	(
		await firestore.collection('player-ranking-history').doc(playerId).get()
	).data()

const seasonStandings = async (seasonId: string) => {
	const snapshot = await seasonRef(seasonId).collection('rankings').get()
	return new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]))
}

/**
 * The standard fixture: one season, one round, two two-player teams, home
 * wins. Small enough that every assertion below can name the expected state.
 */
const seedOneRoundSeason = async () => {
	await seedSeason('season-1', '2030-01-01T00:00:00.000Z')
	await seedTeamWithRoster('winners', 'season-1', ['w1', 'w2'])
	await seedTeamWithRoster('losers', 'season-1', ['l1', 'l2'])
	await seedGame('game-1', {
		seasonId: 'season-1',
		home: 'winners',
		away: 'losers',
		homeScore: 15,
		awayScore: 10,
		date: '2030-01-05T18:00:00.000Z',
	})
}

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await playerRef(ADMIN).set({
		admin: true,
		firstname: 'Admin',
		lastname: 'User',
	})
})

describe('rebuildPlayerRankings', () => {
	it('rates every player on both rosters', async () => {
		// This is the regression test for the migration gap: rosters moved to
		// teams/{id}/teamSeasons/{seasonId}/roster and the pipeline was still
		// reading a roster array on the team document, so it rated nobody.
		await seedOneRoundSeason()

		const result = await rebuild()

		expect(result.status).toBe('completed')
		expect([...(await rankings()).keys()].sort()).toEqual([
			'l1',
			'l2',
			'w1',
			'w2',
		])
	})

	it('rates the winners above the losers', async () => {
		await seedOneRoundSeason()

		await rebuild()
		const saved = await rankings()

		expect(saved.get('w1')?.rating).toBeGreaterThan(INITIAL_MU)
		expect(saved.get('l1')?.rating).toBeLessThan(INITIAL_MU)
		expect(saved.get('w1')?.rating).toBeGreaterThan(saved.get('l1')!.rating)
	})

	it('ranks tied teammates together and skips the ranks they consume', async () => {
		await seedOneRoundSeason()

		await rebuild()
		const saved = await rankings()

		// Both winners come out of one game with identical ratings, as do both
		// losers, so the leaderboard reads 1, 1, 3, 3.
		expect(saved.get('w1')?.rank).toBe(1)
		expect(saved.get('w2')?.rank).toBe(1)
		expect(saved.get('l1')?.rank).toBe(3)
		expect(saved.get('l2')?.rank).toBe(3)
	})

	it('writes the fields the leaderboard renders', async () => {
		await seedOneRoundSeason()

		await rebuild()
		const w1 = (await rankings()).get('w1')!

		expect(w1.playerId).toBe('w1')
		expect(w1.playerName).toBe('w1 Player')
		expect(w1.totalGames).toBe(1)
		expect(w1.totalSeasons).toBe(1)
		expect(w1.lastSeasonId).toBe('season-1')
		expect(w1.player.path).toBe('players/w1')
		expect(w1.lastUpdated).toBeInstanceOf(Timestamp)
	})

	it('ignores games that have not been played yet', async () => {
		await seedOneRoundSeason()
		await seedGame('game-unplayed', {
			seasonId: 'season-1',
			home: 'losers',
			away: 'winners',
			homeScore: null,
			awayScore: null,
			date: '2030-01-12T18:00:00.000Z',
		})

		await rebuild()
		const saved = await rankings()

		// The unplayed rematch would have flipped the standings had it counted.
		expect(saved.get('w1')?.totalGames).toBe(1)
		expect(saved.get('w1')?.rating).toBeGreaterThan(saved.get('l1')!.rating)
		// It must also not reach the round grouper. processGame skips a game
		// with no score, so ratings would come out right either way — but an
		// unfiltered game still forms a round, which adds a history point for
		// an evening that was never played and decays everyone a step for it.
		// Asserting on the round count is what pins the filter down.
		expect((await playerHistory('w1'))!.rounds).toHaveLength(1)
	})

	it('counts a game in each season a player appears in', async () => {
		await seedSeason('season-1', '2029-01-01T00:00:00.000Z')
		await seedSeason('season-2', '2030-01-01T00:00:00.000Z')
		await seedTeamWithRoster('winners', 'season-1', ['w1'])
		await seedTeamWithRoster('losers', 'season-1', ['l1'])
		await seedTeamWithRoster('winners', 'season-2', ['w1'])
		await seedTeamWithRoster('losers', 'season-2', ['l1'])
		await seedGame('old-game', {
			seasonId: 'season-1',
			home: 'winners',
			away: 'losers',
			homeScore: 15,
			awayScore: 10,
			date: '2029-01-05T18:00:00.000Z',
		})
		await seedGame('new-game', {
			seasonId: 'season-2',
			home: 'winners',
			away: 'losers',
			homeScore: 15,
			awayScore: 10,
			date: '2030-01-05T18:00:00.000Z',
		})

		await rebuild()
		const w1 = (await rankings()).get('w1')!

		expect(w1.totalGames).toBe(2)
		expect(w1.totalSeasons).toBe(2)
		expect(w1.lastSeasonId).toBe('season-2')
	})

	it('groups games that start together into a single round', async () => {
		await seedSeason('season-1', '2030-01-01T00:00:00.000Z')
		await seedTeamWithRoster('a', 'season-1', ['a1'])
		await seedTeamWithRoster('b', 'season-1', ['b1'])
		await seedTeamWithRoster('c', 'season-1', ['c1'])
		await seedTeamWithRoster('d', 'season-1', ['d1'])
		await seedGame('game-1', {
			seasonId: 'season-1',
			home: 'a',
			away: 'b',
			homeScore: 15,
			awayScore: 10,
			date: '2030-01-05T18:00:00.000Z',
		})
		await seedGame('game-2', {
			seasonId: 'season-1',
			home: 'c',
			away: 'd',
			homeScore: 15,
			awayScore: 10,
			date: '2030-01-05T18:00:00.000Z',
		})

		await rebuild()
		const a1 = (await playerHistory('a1'))!.rounds
		const c1 = (await playerHistory('c1'))!.rounds

		expect(a1).toHaveLength(1)
		expect(c1).toHaveLength(1)
		expect(c1[0].roundId).toBe(a1[0].roundId)
	})

	it('weights a playoff win more heavily than a regular season win', async () => {
		await seedSeason('season-1', '2030-01-01T00:00:00.000Z')
		await seedTeamWithRoster('regular-winners', 'season-1', ['reg'])
		await seedTeamWithRoster('regular-losers', 'season-1', ['reg-loser'])
		await seedTeamWithRoster('playoff-winners', 'season-1', ['post'])
		await seedTeamWithRoster('playoff-losers', 'season-1', ['post-loser'])
		// Same round, same scoreline, so the game type is the only difference.
		await seedGame('regular-game', {
			seasonId: 'season-1',
			home: 'regular-winners',
			away: 'regular-losers',
			homeScore: 15,
			awayScore: 10,
			date: '2030-01-05T18:00:00.000Z',
			type: 'regular',
		})
		await seedGame('playoff-game', {
			seasonId: 'season-1',
			home: 'playoff-winners',
			away: 'playoff-losers',
			homeScore: 15,
			awayScore: 10,
			date: '2030-01-05T18:00:00.000Z',
			type: 'playoff',
		})

		await rebuild()
		const saved = await rankings()

		expect(saved.get('post')?.rating).toBeGreaterThan(saved.get('reg')!.rating)
	})

	it('weights an older season less than the current one', async () => {
		await seedSeason('season-1', '2029-01-01T00:00:00.000Z')
		await seedSeason('season-2', '2030-01-01T00:00:00.000Z')
		await seedTeamWithRoster('old-winners', 'season-1', ['old'])
		await seedTeamWithRoster('old-losers', 'season-1', ['old-loser'])
		await seedTeamWithRoster('new-winners', 'season-2', ['new'])
		await seedTeamWithRoster('new-losers', 'season-2', ['new-loser'])
		await seedGame('old-game', {
			seasonId: 'season-1',
			home: 'old-winners',
			away: 'old-losers',
			homeScore: 15,
			awayScore: 10,
			date: '2029-01-05T18:00:00.000Z',
		})
		await seedGame('new-game', {
			seasonId: 'season-2',
			home: 'new-winners',
			away: 'new-losers',
			homeScore: 15,
			awayScore: 10,
			date: '2030-01-05T18:00:00.000Z',
		})

		await rebuild()
		const saved = await rankings()

		// SEASON_CARRY_OVER moves the old winner part of the way back to the
		// baseline as the new season begins, and the later round they sit out
		// decays them further.
		expect(saved.get('new')?.rating).toBeGreaterThan(saved.get('old')!.rating)
	})

	it('drifts a player who stops playing back toward the baseline', async () => {
		await seedSeason('season-1', '2030-01-01T00:00:00.000Z')
		await seedTeamWithRoster('early-winners', 'season-1', ['quitter'])
		await seedTeamWithRoster('early-losers', 'season-1', ['early-loser'])
		await seedTeamWithRoster('late-winners', 'season-1', ['regular'])
		await seedTeamWithRoster('late-losers', 'season-1', ['late-loser'])
		await seedGame('round-1', {
			seasonId: 'season-1',
			home: 'early-winners',
			away: 'early-losers',
			homeScore: 15,
			awayScore: 10,
			date: '2030-01-05T18:00:00.000Z',
		})
		// The quitter is absent from every later round and decays through all
		// of them; ratings after round 1 are otherwise identical.
		for (const [index, date] of [
			'2030-01-12T18:00:00.000Z',
			'2030-01-19T18:00:00.000Z',
			'2030-01-26T18:00:00.000Z',
		].entries()) {
			await seedGame(`later-round-${index}`, {
				seasonId: 'season-1',
				home: 'late-winners',
				away: 'late-losers',
				homeScore: 15,
				awayScore: 10,
				date,
			})
		}

		await rebuild()
		const saved = await rankings()

		expect(saved.get('quitter')?.rating).toBeGreaterThan(INITIAL_MU)
		expect(saved.get('quitter')?.rating).toBeLessThan(
			saved.get('regular')!.rating
		)
	})

	it('reports the rating change over the latest game night', async () => {
		// Measured from the games, not from the previous rebuild, so the
		// nightly rebuild with nothing new cannot reset it to zero.
		await seedOneRoundSeason()
		await seedGame('game-2', {
			seasonId: 'season-1',
			home: 'winners',
			away: 'losers',
			homeScore: 15,
			awayScore: 12,
			date: '2030-01-12T18:00:00.000Z',
		})

		await rebuild()
		const points = (await playerHistory('w1'))!.rounds
		const w1 = (await rankings()).get('w1')!

		expect(w1.lastRatingChange).toBeCloseTo(
			points[1].rating - points[0].rating,
			10
		)
		await rebuild()
		expect((await rankings()).get('w1')?.lastRatingChange).toBeCloseTo(
			w1.lastRatingChange,
			10
		)
	})

	it('records the calculation as completed with full progress', async () => {
		await seedOneRoundSeason()

		const result = await rebuild()
		const calculation = (
			await firestore
				.collection('rankings-calculations')
				.doc(result.calculationId)
				.get()
		).data()!

		expect(calculation.status).toBe('completed')
		expect(calculation.calculationType).toBe('fresh')
		expect(calculation.triggeredBy).toBe(ADMIN)
		expect(calculation.progress.percentComplete).toBe(100)
		expect(calculation.progress.totalSeasons).toBe(1)
		expect(calculation.progress.totalGames).toBe(1)
		expect(calculation.completedAt).toBeInstanceOf(Timestamp)
	})

	it('completes with no rankings when there are no games at all', async () => {
		await seedSeason('season-1', '2030-01-01T00:00:00.000Z')

		const result = await rebuild()

		expect(result.status).toBe('completed')
		expect((await rankings()).size).toBe(0)
		expect(await historyCount()).toBe(0)
	})

	it('skips a game whose team has no roster for that season', async () => {
		await seedOneRoundSeason()
		// A team-season with no roster entries — the shape a team has between
		// being created and its first player joining.
		await seedTeamWithRoster('empty', 'season-1', [])
		await seedGame('game-forfeit', {
			seasonId: 'season-1',
			home: 'winners',
			away: 'empty',
			homeScore: 15,
			awayScore: 0,
			date: '2030-01-12T18:00:00.000Z',
		})

		const result = await rebuild()
		const saved = await rankings()

		expect(result.status).toBe('completed')
		expect(saved.get('w1')?.totalGames).toBe(1)
		expect(saved.size).toBe(4)
	})

	it('rates a player who joined mid-season only from the round they appear in', async () => {
		await seedOneRoundSeason()
		await teamRosterEntryRef(firestore, 'winners', 'season-1', 'w3').set({
			player: playerRef('w3'),
			dateJoined: Timestamp.now(),
		})
		await playerRef('w3').set({
			admin: false,
			firstname: 'w3',
			lastname: 'Player',
		})

		await rebuild()
		const saved = await rankings()

		// The roster is read per round, so w3 counts for the only round there is.
		expect(saved.get('w3')?.totalGames).toBe(1)
	})

	it('skips a roster entry whose player document is missing', async () => {
		await seedOneRoundSeason()
		await teamRosterEntryRef(firestore, 'winners', 'season-1', 'ghost').set({
			player: playerRef('ghost'),
			dateJoined: Timestamp.now(),
		})

		const result = await rebuild()
		const saved = await rankings()

		expect(result.status).toBe('completed')
		expect(saved.has('ghost')).toBe(false)
		expect(saved.get('w1')?.totalGames).toBe(1)
	})

	it('removes players who no longer appear in any game', async () => {
		await seedOneRoundSeason()
		await firestore
			.collection('rankings')
			.doc('retired-player')
			.set({
				playerId: 'retired-player',
				playerName: 'Retired Player',
				rating: 40,
				rank: 1,
				totalGames: 99,
				totalSeasons: 9,
				lastSeasonId: 'season-0',
				lastRatingChange: 0,
				player: playerRef('retired-player'),
				lastUpdated: Timestamp.now(),
			})

		await rebuild()
		const saved = await rankings()

		// A rebuild processes every season, so a player only drops out when
		// they are no longer on the roster of any game ever played. Left
		// behind, this document keeps a rating and a rank computed against a
		// leaderboard that no longer exists — and outranks everyone.
		expect(saved.has('retired-player')).toBe(false)
		expect(saved.size).toBe(4)
	})

	it('keeps a player who only appears in an older season', async () => {
		// The counterpart to the deletion above: not playing *this* season is
		// not the same as never having played, and only the latter should
		// remove someone from the leaderboard.
		await seedSeason('season-1', '2029-01-01T00:00:00.000Z')
		await seedSeason('season-2', '2030-01-01T00:00:00.000Z')
		await seedTeamWithRoster('old-winners', 'season-1', ['retiree'])
		await seedTeamWithRoster('old-losers', 'season-1', ['old-loser'])
		await seedTeamWithRoster('new-winners', 'season-2', ['current'])
		await seedTeamWithRoster('new-losers', 'season-2', ['new-loser'])
		await seedGame('old-game', {
			seasonId: 'season-1',
			home: 'old-winners',
			away: 'old-losers',
			homeScore: 15,
			awayScore: 10,
			date: '2029-01-05T18:00:00.000Z',
		})
		await seedGame('new-game', {
			seasonId: 'season-2',
			home: 'new-winners',
			away: 'new-losers',
			homeScore: 15,
			awayScore: 10,
			date: '2030-01-05T18:00:00.000Z',
		})

		await rebuild()
		const saved = await rankings()

		expect(saved.has('retiree')).toBe(true)
		expect(saved.get('retiree')?.lastSeasonId).toBe('season-1')
	})

	it('rebuilds a full-size league and clears a large backlog of stale entries', async () => {
		// Closer to production scale than the rest of the suite: 252 players
		// and 300 documents to remove. The batch chunking this crosses is not
		// covered here — the emulator does not enforce Firestore's 500-op
		// batch limit, so that is pinned in rankingsSaver.test.ts instead.
		const playersPerTeam = 126
		await seedSeason('season-1', '2030-01-01T00:00:00.000Z')
		await seedTeamWithRoster(
			'big-winners',
			'season-1',
			Array.from({ length: playersPerTeam }, (_, i) => `w${i}`)
		)
		await seedTeamWithRoster(
			'big-losers',
			'season-1',
			Array.from({ length: playersPerTeam }, (_, i) => `l${i}`)
		)
		await seedGame('game-1', {
			seasonId: 'season-1',
			home: 'big-winners',
			away: 'big-losers',
			homeScore: 15,
			awayScore: 10,
			date: '2030-01-05T18:00:00.000Z',
		})
		for (let i = 0; i < 300; i++) {
			await firestore
				.collection('rankings')
				.doc(`gone-${i}`)
				.set({ playerId: `gone-${i}`, rating: 25, rank: 1 })
		}

		const result = await rebuild()

		expect(result.status).toBe('completed')
		expect((await rankings()).size).toBe(playersPerTeam * 2)
	}, 60_000)

	it('is idempotent across repeated rebuilds of the same data', async () => {
		await seedOneRoundSeason()

		await rebuild()
		const first = await rankings()
		await rebuild()
		const second = await rankings()

		expect(second.size).toBe(first.size)
		for (const [playerId, ranking] of second) {
			expect(ranking.rating).toBeCloseTo(first.get(playerId)!.rating, 10)
			expect(ranking.rank).toBe(first.get(playerId)!.rank)
			expect(ranking.totalGames).toBe(first.get(playerId)!.totalGames)
		}
	})
})

describe('rebuildPlayerRankings: histories and season standings', () => {
	/** Two seasons: winners beat losers in each, and w1 sits out season 2. */
	const seedTwoSeasons = async () => {
		await seedSeason('season-1', '2029-01-01T00:00:00.000Z')
		await seedSeason('season-2', '2030-01-01T00:00:00.000Z')
		await seedTeamWithRoster('winners', 'season-1', ['w1', 'w2'])
		await seedTeamWithRoster('losers', 'season-1', ['l1', 'l2'])
		await seedTeamWithRoster('winners', 'season-2', ['w2'])
		await seedTeamWithRoster('losers', 'season-2', ['l1', 'l2'])
		for (const [id, seasonId, date] of [
			['old-game', 'season-1', '2029-01-05T18:00:00.000Z'],
			['new-game', 'season-2', '2030-01-05T18:00:00.000Z'],
		]) {
			await seedGame(id, {
				seasonId,
				home: 'winners',
				away: 'losers',
				homeScore: 15,
				awayScore: 10,
				date,
			})
		}
	}

	it("writes every player's history, one point per round", async () => {
		await seedTwoSeasons()

		const result = await rebuild()
		const w2 = (await playerHistory('w2'))!

		expect(w2.playerName).toBe('w2 Player')
		expect(w2.player.path).toBe('players/w2')
		expect(w2.calculationId).toBe(result.calculationId)
		expect(
			w2.rounds.map((point: { seasonId: string }) => point.seasonId)
		).toEqual(['season-1', 'season-2'])
		expect(w2.rounds[1].date).toBeInstanceOf(Timestamp)
		expect(w2.rounds[1]).toMatchObject({
			rank: 1,
			seasonRank: 1,
			totalGames: 2,
		})
	})

	it('gives no season rank for a season the player was not rostered in', async () => {
		await seedTwoSeasons()

		await rebuild()
		const w1 = (await playerHistory('w1'))!

		expect(w1.rounds[1].seasonId).toBe('season-2')
		expect(w1.rounds[1].seasonRank).toBeNull()
	})

	it("writes each season's standings for its rostered players", async () => {
		await seedTwoSeasons()

		await rebuild()
		const standings = await seasonStandings('season-2')

		expect([...standings.keys()].sort()).toEqual(['l1', 'l2', 'w2'])
		expect(standings.get('w2')).toMatchObject({
			rank: 1,
			games: 1,
			wins: 1,
			losses: 0,
			playerName: 'w2 Player',
		})
		expect(standings.get('l1')).toMatchObject({ rank: 2, wins: 0, losses: 1 })
		expect(standings.get('w2')?.ratingChange).toBeGreaterThan(0)
	})

	it('clears what a rebuild no longer produces', async () => {
		await seedTwoSeasons()
		await rebuild()

		// l2 leaves season 2's roster, and season 2's only game moves a week.
		await firestore.doc('teams/losers/teamSeasons/season-2/roster/l2').delete()
		await firestore
			.collection('games')
			.doc('new-game')
			.update({
				date: Timestamp.fromDate(new Date('2030-01-12T18:00:00.000Z')),
			})
		await rebuild()

		expect((await seasonStandings('season-2')).has('l2')).toBe(false)
		// l1 played both seasons, so their history shows the game's new date.
		expect(
			(await playerHistory('l1'))!.rounds.map((round: { date: Timestamp }) =>
				round.date.toDate().toISOString()
			)
		).toEqual(['2029-01-05T18:00:00.000Z', '2030-01-12T18:00:00.000Z'])
	})

	it('clears the standings and histories of a season whose games are gone', async () => {
		await seedTwoSeasons()
		await rebuild()

		await firestore.collection('games').doc('old-game').delete()
		await rebuild()

		expect((await seasonStandings('season-1')).size).toBe(0)
		// w1 only ever played season 1.
		expect(await playerHistory('w1')).toBeUndefined()
		expect((await rankings()).has('w1')).toBe(false)
	})
})

describe('rebuildPlayerRankings: one at a time', () => {
	const seedCalculation = async (status: string, startedAt: Date) => {
		await firestore
			.collection('rankings-calculations')
			.doc('earlier')
			.set({
				calculationType: 'fresh',
				status,
				startedAt: Timestamp.fromDate(startedAt),
				triggeredBy: 'someone',
			})
	}

	it('refuses while another rebuild is running', async () => {
		await seedOneRoundSeason()
		await seedCalculation('running', new Date())

		const code = await errorCodeFrom(rebuildPlayerRankings, {
			auth: authed(ADMIN),
			data: {},
		})

		expect(code).toBe('failed-precondition')
		expect((await rankings()).size).toBe(0)
	})

	it('ignores a rebuild that died without finishing', async () => {
		await seedOneRoundSeason()
		await seedCalculation('running', new Date(Date.now() - 60 * 60 * 1000))

		expect((await rebuild()).status).toBe('completed')
	})
})

describe('rebuildRankingsNightly', () => {
	const runNightly = async () =>
		await rebuildRankingsNightly.run({
			scheduleTime: new Date().toISOString(),
		} as never)

	it('rebuilds the rankings, recorded as the schedule', async () => {
		await seedOneRoundSeason()

		await runNightly()

		expect((await rankings()).size).toBe(4)
		const calculations = await firestore
			.collection('rankings-calculations')
			.get()
		expect(calculations.docs.map((doc) => doc.data().triggeredBy)).toEqual([
			'schedule',
		])
	})

	it('skips a night when a rebuild is already running', async () => {
		await seedOneRoundSeason()
		await firestore.collection('rankings-calculations').doc('manual').set({
			status: 'running',
			startedAt: Timestamp.now(),
		})

		await runNightly()

		expect((await rankings()).size).toBe(0)
	})

	it('does nothing while a migration is in progress', async () => {
		await seedOneRoundSeason()
		await firestore.doc('system/maintenance').set({ migrationInProgress: true })

		await runNightly()

		expect((await rankings()).size).toBe(0)
	})
})
