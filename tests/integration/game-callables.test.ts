import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
} from './helpers.js'
import {
	createGame,
	updateGame,
	deleteGame,
} from '../../Functions/src/index.js'
import { teamSeasonRef } from '../../Functions/src/shared/database.js'

/**
 * Games carry the one denormalization this codebase documents as an
 * invariant: `homeName` and `awayName` are snapshots of the team's name for
 * that season, so schedules and standings render without a join. Only
 * createGame and updateGame may write them, and if they drift, every schedule
 * and results table shows the wrong team.
 *
 * The scheduling rules are also worth pinning. Saturday detection is a
 * hand-rolled Zeller's congruence over date components pulled out of the ISO
 * string with a regex — deliberately, to avoid the runtime's timezone — and
 * the time slots are matched as literal text for the same reason. Both are
 * the kind of thing that looks equivalent to a `Date`-based rewrite and is
 * not.
 */

const ADMIN = 'admin-uid'
const SEASON = 'season-1'
/** 2030-01-05 is a Saturday; 18:00 is the first allowed slot. */
const SATURDAY_6PM = '2030-01-05T18:00:00.000-06:00'

let firestore: Firestore

const call = async <T>(
	fn: { run: (request: CallableRequest<never>) => unknown },
	data: unknown
): Promise<T> =>
	(await fn.run({
		auth: authed(ADMIN),
		data,
	} as unknown as CallableRequest<never>)) as T

const readGame = async (gameId: string) =>
	(await firestore.collection('games').doc(gameId).get()).data()

const seedTeamSeason = async (
	teamId: string,
	name: string,
	seasonId = SEASON
) => {
	await firestore
		.collection('teams')
		.doc(teamId)
		.set({ createdAt: Timestamp.now(), createdBy: null })
	await teamSeasonRef(firestore, teamId, seasonId).set({
		season: firestore.collection('seasons').doc(seasonId),
		name,
		logo: null,
		storagePath: null,
		registered: true,
		registeredDate: null,
		placement: null,
	})
}

const validGame = (overrides: Record<string, unknown> = {}) => ({
	homeTeamId: 'home-team',
	awayTeamId: 'away-team',
	homeScore: null,
	awayScore: null,
	field: 1,
	type: 'regular',
	timestamp: SATURDAY_6PM,
	seasonId: SEASON,
	...overrides,
})

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await firestore
		.collection('players')
		.doc(ADMIN)
		.set({ admin: true, email: `${ADMIN}@example.com` })
	await firestore
		.collection('seasons')
		.doc(SEASON)
		.set({ name: '2030 Winter', dateStart: Timestamp.now() })
	await seedTeamSeason('home-team', 'Homemade Furby')
	await seedTeamSeason('away-team', 'Frying Dump-Ring')
})

describe('createGame', () => {
	it('denormalizes both team names from their season subdocs', async () => {
		const { gameId } = await call<{ gameId: string }>(createGame, validGame())
		const game = await readGame(gameId)

		expect(game?.homeName).toBe('Homemade Furby')
		expect(game?.awayName).toBe('Frying Dump-Ring')
		expect(game?.home.path).toBe('teams/home-team')
		expect(game?.away.path).toBe('teams/away-team')
		expect(game?.season.path).toBe(`seasons/${SEASON}`)
	})

	it('takes the name from the season being played, not the latest one', async () => {
		// A team renamed between seasons must still show its old name on old
		// games. This is the reason the field exists rather than a join.
		await firestore
			.collection('seasons')
			.doc('season-2')
			.set({ name: '2031 Winter', dateStart: Timestamp.now() })
		await seedTeamSeason('home-team', 'Renamed For 2031', 'season-2')

		const { gameId } = await call<{ gameId: string }>(createGame, validGame())

		expect((await readGame(gameId))?.homeName).toBe('Homemade Furby')
	})

	it('stores a placeholder game with no teams', async () => {
		const { gameId } = await call<{ gameId: string }>(
			createGame,
			validGame({ homeTeamId: null, awayTeamId: null })
		)
		const game = await readGame(gameId)

		expect(game?.home).toBeNull()
		expect(game?.homeName).toBeNull()
		expect(game?.away).toBeNull()
		expect(game?.awayName).toBeNull()
	})

	it('records scores when they are supplied', async () => {
		const { gameId } = await call<{ gameId: string }>(
			createGame,
			validGame({ homeScore: 15, awayScore: 10 })
		)
		const game = await readGame(gameId)

		expect(game?.homeScore).toBe(15)
		expect(game?.awayScore).toBe(10)
	})

	it('allows a zero score', async () => {
		// A forfeit is 15-0, so zero has to survive the non-negative check
		// that a falsy test would reject.
		const { gameId } = await call<{ gameId: string }>(
			createGame,
			validGame({ homeScore: 15, awayScore: 0 })
		)

		expect((await readGame(gameId))?.awayScore).toBe(0)
	})

	it('derives a deterministic id from season, time and field', async () => {
		// The id is what makes duplicate creation impossible rather than
		// merely unlikely, so its shape is load-bearing.
		const { gameId } = await call<{ gameId: string }>(createGame, validGame())

		expect(gameId).toBe(`${SEASON}_2030-01-06T00:00:00.000Z_1`)
	})

	it('rejects a second game in the same slot on the same field', async () => {
		await call(createGame, validGame())

		expect(
			await errorCodeFrom(createGame, {
				auth: authed(ADMIN),
				data: validGame(),
			})
		).toBe('already-exists')
	})

	it('allows the same slot on a different field', async () => {
		await call(createGame, validGame())
		const { gameId } = await call<{ gameId: string }>(
			createGame,
			validGame({ field: 2 })
		)

		expect((await readGame(gameId))?.field).toBe(2)
	})

	it.each([
		['Sunday', '2030-01-06T18:00:00.000-06:00'],
		['Friday', '2030-01-04T18:00:00.000-06:00'],
	])('rejects a game on a %s', async (_day, timestamp) => {
		expect(
			await errorCodeFrom(createGame, {
				auth: authed(ADMIN),
				data: validGame({ timestamp }),
			})
		).toBe('invalid-argument')
	})

	it.each(['18:00', '18:45', '19:30', '20:15'])(
		'accepts the %s slot',
		async (time) => {
			const { gameId } = await call<{ gameId: string }>(
				createGame,
				validGame({ timestamp: `2030-01-05T${time}:00.000-06:00` })
			)

			expect(await readGame(gameId)).toBeDefined()
		}
	)

	it.each(['17:00', '18:30', '21:00'])('rejects the %s slot', async (time) => {
		expect(
			await errorCodeFrom(createGame, {
				auth: authed(ADMIN),
				data: validGame({
					timestamp: `2030-01-05T${time}:00.000-06:00`,
				}),
			})
		).toBe('invalid-argument')
	})

	it('reads the slot as written, not as the runtime would localise it', async () => {
		// The same instant written with a different offset is a different
		// local kickoff time. Parsing through Date would make these agree and
		// let a game through at the wrong hour.
		expect(
			await errorCodeFrom(createGame, {
				auth: authed(ADMIN),
				data: validGame({ timestamp: '2030-01-06T00:00:00.000Z' }),
			})
		).toBe('invalid-argument')
	})

	it.each([[0], [4], [-1]])('rejects field %i', async (field) => {
		expect(
			await errorCodeFrom(createGame, {
				auth: authed(ADMIN),
				data: validGame({ field }),
			})
		).toBe('invalid-argument')
	})

	it('rejects a negative score', async () => {
		expect(
			await errorCodeFrom(createGame, {
				auth: authed(ADMIN),
				data: validGame({ homeScore: -1 }),
			})
		).toBe('invalid-argument')
	})

	it('rejects a game type that is neither regular nor playoff', async () => {
		expect(
			await errorCodeFrom(createGame, {
				auth: authed(ADMIN),
				data: validGame({ type: 'scrimmage' }),
			})
		).toBe('invalid-argument')
	})

	it('rejects a season that does not exist', async () => {
		expect(
			await errorCodeFrom(createGame, {
				auth: authed(ADMIN),
				data: validGame({ seasonId: 'no-such-season' }),
			})
		).toBe('not-found')
	})

	it('rejects a team that is not playing this season', async () => {
		// The team document exists but has no subdoc for this season, which
		// is exactly what a team from a previous year looks like.
		await firestore
			.collection('teams')
			.doc('other-season-team')
			.set({ createdAt: Timestamp.now(), createdBy: null })

		expect(
			await errorCodeFrom(createGame, {
				auth: authed(ADMIN),
				data: validGame({ homeTeamId: 'other-season-team' }),
			})
		).toBe('not-found')
	})

	it('writes nothing when a later validation fails', async () => {
		await errorCodeFrom(createGame, {
			auth: authed(ADMIN),
			data: validGame({ awayTeamId: 'nonexistent' }),
		})

		expect((await firestore.collection('games').get()).empty).toBe(true)
	})
})

describe('updateGame', () => {
	const createDefault = async () =>
		(await call<{ gameId: string }>(createGame, validGame())).gameId

	it('re-captures the denormalized name when the team changes', async () => {
		const gameId = await createDefault()
		await seedTeamSeason('third-team', 'Birdtown Ballers')

		await call(updateGame, { gameId, homeTeamId: 'third-team' })
		const game = await readGame(gameId)

		expect(game?.home.path).toBe('teams/third-team')
		expect(game?.homeName).toBe('Birdtown Ballers')
	})

	it('clears the name when a team is removed', async () => {
		const gameId = await createDefault()

		await call(updateGame, { gameId, homeTeamId: null })
		const game = await readGame(gameId)

		expect(game?.home).toBeNull()
		expect(game?.homeName).toBeNull()
	})

	it('leaves the other team untouched', async () => {
		const gameId = await createDefault()
		await seedTeamSeason('third-team', 'Birdtown Ballers')

		await call(updateGame, { gameId, homeTeamId: 'third-team' })

		expect((await readGame(gameId))?.awayName).toBe('Frying Dump-Ring')
	})

	it('records a score without disturbing the teams', async () => {
		const gameId = await createDefault()

		await call(updateGame, { gameId, homeScore: 15, awayScore: 13 })
		const game = await readGame(gameId)

		expect(game?.homeScore).toBe(15)
		expect(game?.awayScore).toBe(13)
		expect(game?.homeName).toBe('Homemade Furby')
	})

	it('moves a game to a free slot', async () => {
		const gameId = await createDefault()

		await call(updateGame, {
			gameId,
			timestamp: '2030-01-05T19:30:00.000-06:00',
		})

		expect((await readGame(gameId))?.date.toDate().toISOString()).toBe(
			'2030-01-06T01:30:00.000Z'
		)
	})

	it('refuses to move a game onto an occupied slot', async () => {
		const gameId = await createDefault()
		await call(createGame, {
			...validGame(),
			field: 2,
			timestamp: '2030-01-05T19:30:00.000-06:00',
		})

		expect(
			await errorCodeFrom(updateGame, {
				auth: authed(ADMIN),
				data: {
					gameId,
					field: 2,
					timestamp: '2030-01-05T19:30:00.000-06:00',
				},
			})
		).toBe('already-exists')
	})

	it('allows an update that leaves a game in its own slot', async () => {
		// The duplicate check has to exclude the game being updated, or no
		// game could ever have its score recorded alongside a field edit.
		const gameId = await createDefault()

		await call(updateGame, { gameId, field: 1, homeScore: 15 })

		expect((await readGame(gameId))?.homeScore).toBe(15)
	})

	it('applies the same schedule rules as creation', async () => {
		const gameId = await createDefault()

		expect(
			await errorCodeFrom(updateGame, {
				auth: authed(ADMIN),
				data: { gameId, timestamp: '2030-01-06T18:00:00.000-06:00' },
			})
		).toBe('invalid-argument')
	})

	it('rejects an unknown game', async () => {
		expect(
			await errorCodeFrom(updateGame, {
				auth: authed(ADMIN),
				data: { gameId: 'no-such-game', homeScore: 1 },
			})
		).toBe('not-found')
	})

	it('rejects a team that is not playing the game’s season', async () => {
		const gameId = await createDefault()
		await firestore
			.collection('teams')
			.doc('stranger')
			.set({ createdAt: Timestamp.now(), createdBy: null })

		expect(
			await errorCodeFrom(updateGame, {
				auth: authed(ADMIN),
				data: { gameId, homeTeamId: 'stranger' },
			})
		).toBe('not-found')
	})

	it('leaves the game untouched when an update fails', async () => {
		const gameId = await createDefault()

		await errorCodeFrom(updateGame, {
			auth: authed(ADMIN),
			data: { gameId, homeScore: 15, homeTeamId: 'stranger' },
		})

		expect((await readGame(gameId))?.homeScore).toBeNull()
	})

	it('re-captures both team names when only the season is moved', async () => {
		// The name is a snapshot of the team's name *for the game's season*,
		// so moving the season invalidates it even though neither team
		// changed. This previously left the game pointing at the new season
		// under the old season's names.
		const gameId = await createDefault()
		await firestore
			.collection('seasons')
			.doc('season-2')
			.set({ name: '2031 Winter', dateStart: Timestamp.now() })
		await seedTeamSeason('home-team', 'Renamed For 2031', 'season-2')
		await seedTeamSeason('away-team', 'Also Renamed', 'season-2')

		await call(updateGame, { gameId, seasonId: 'season-2' })
		const game = await readGame(gameId)

		expect(game?.season.path).toBe('seasons/season-2')
		expect(game?.homeName).toBe('Renamed For 2031')
		expect(game?.awayName).toBe('Also Renamed')
		expect(game?.home.path).toBe('teams/home-team')
	})

	it('refuses to move a game to a season its teams do not play', async () => {
		// The alternative is a game listed under a season with names for
		// teams that were never in it.
		const gameId = await createDefault()
		await firestore
			.collection('seasons')
			.doc('season-2')
			.set({ name: '2031 Winter', dateStart: Timestamp.now() })

		expect(
			await errorCodeFrom(updateGame, {
				auth: authed(ADMIN),
				data: { gameId, seasonId: 'season-2' },
			})
		).toBe('not-found')
		expect((await readGame(gameId))?.season.path).toBe(`seasons/${SEASON}`)
	})

	it('moves a placeholder game between seasons without a team to re-read', async () => {
		const { gameId } = await call<{ gameId: string }>(
			createGame,
			validGame({ homeTeamId: null, awayTeamId: null })
		)
		await firestore
			.collection('seasons')
			.doc('season-2')
			.set({ name: '2031 Winter', dateStart: Timestamp.now() })

		await call(updateGame, { gameId, seasonId: 'season-2' })
		const game = await readGame(gameId)

		expect(game?.season.path).toBe('seasons/season-2')
		expect(game?.homeName).toBeNull()
	})

	it('changes team and season together in one update', async () => {
		const gameId = await createDefault()
		await firestore
			.collection('seasons')
			.doc('season-2')
			.set({ name: '2031 Winter', dateStart: Timestamp.now() })
		await seedTeamSeason('home-team', 'Renamed For 2031', 'season-2')
		await seedTeamSeason('third-team', 'Birdtown Ballers', 'season-2')

		await call(updateGame, {
			gameId,
			seasonId: 'season-2',
			awayTeamId: 'third-team',
		})
		const game = await readGame(gameId)

		expect(game?.homeName).toBe('Renamed For 2031')
		expect(game?.awayName).toBe('Birdtown Ballers')
	})

	it('does not re-read team names when neither team nor season changes', async () => {
		// Recording a score must not require the teams to still be in the
		// season — an admin fixing a typo after a season rolls over would
		// otherwise be blocked.
		const gameId = await createDefault()
		await teamSeasonRef(firestore, 'away-team', SEASON).delete()

		await call(updateGame, { gameId, homeScore: 15, awayScore: 13 })

		expect((await readGame(gameId))?.homeScore).toBe(15)
	})
})

describe('deleteGame', () => {
	it('removes the game', async () => {
		const { gameId } = await call<{ gameId: string }>(createGame, validGame())

		await call(deleteGame, { gameId })

		expect(await readGame(gameId)).toBeUndefined()
	})

	it('reports an unknown game as not-found', async () => {
		expect(
			await errorCodeFrom(deleteGame, {
				auth: authed(ADMIN),
				data: { gameId: 'no-such-game' },
			})
		).toBe('not-found')
	})

	it('reports a missing game id as invalid-argument', async () => {
		expect(
			await errorCodeFrom(deleteGame, { auth: authed(ADMIN), data: {} })
		).toBe('invalid-argument')
	})

	it('frees the slot for a new game', async () => {
		const { gameId } = await call<{ gameId: string }>(createGame, validGame())
		await call(deleteGame, { gameId })

		const recreated = await call<{ gameId: string }>(createGame, validGame())

		expect(recreated.gameId).toBe(gameId)
	})
})
