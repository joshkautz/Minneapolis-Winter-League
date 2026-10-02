import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from 'firebase-functions/v2'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	type Callable,
} from './helpers.js'
import { updatePlayoffs } from '../../Functions/src/services/schedule/sync.js'

/**
 * The generated schedule against the emulator: the regular season's games
 * at the paths and in the shape the site reads, and the playoffs following
 * from the scores — pool night, championship night and the placements —
 * through the trigger, as they will on the night.
 */

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const SEASON = 'season-5'
const ADMIN = 'admin-1'
const TEAM_IDS = Array.from(
	{ length: 12 },
	(_, i) => `team-${String(i + 1).padStart(2, '0')}`
)

const seasonRef = () => firestore.collection('seasons').doc(SEASON)
const teamRef = (id: string) => firestore.collection('teams').doc(id)
const teamSeason = (id: string) =>
	teamRef(id).collection('teamSeasons').doc(SEASON)

const call = (name: string, data: Record<string, unknown>) =>
	(manifest[name] as Callable).run({
		auth: authed(ADMIN),
		data,
	} as unknown as CallableRequest<never>)

const generate = (dryRun = false) =>
	call('generateSchedule', { seasonId: SEASON, dryRun }) as Promise<{
		games: { homeTeamId: string; date: string }[]
		poolNight: string
		championshipNight: string
		regularNights: string[]
	}>

/** Fires the trigger as a write to `gameId` would. */
const fireTrigger = async (gameId: string) => {
	const doc = await firestore.collection('games').doc(gameId).get()
	return manifest.updatePlayoffsOnGameChange.run({
		id: `evt-${gameId}`,
		params: { gameId },
		data: {
			before: { exists: false, data: () => undefined },
			after: { exists: true, data: () => doc.data() },
		},
	})
}

const games = async (
	filter?: (data: FirebaseFirestore.DocumentData) => boolean
) =>
	(
		await firestore.collection('games').where('season', '==', seasonRef()).get()
	).docs.filter((doc) => !filter || filter(doc.data()))

const playoffGames = (prefix: string) =>
	games((data) => String(data.playoffSlot ?? '').startsWith(prefix))

/** The lower-numbered team wins by a margin that grows with the gap. */
const scoreAll = async (
	docs: FirebaseFirestore.QueryDocumentSnapshot[],
	winner: (home: string, away: string) => 'home' | 'away' = (home, away) =>
		home < away ? 'home' : 'away'
) => {
	for (const doc of docs) {
		const { home, away } = doc.data()
		const homeWins = winner(home.id, away.id) === 'home'
		const margin =
			1 + (Math.abs(TEAM_IDS.indexOf(home.id) - TEAM_IDS.indexOf(away.id)) % 5)
		await doc.ref.update({
			homeScore: homeWins ? 11 + margin : 11,
			awayScore: homeWins ? 11 : 11 + margin,
		})
	}
}

const bySlot = async (slot: string) =>
	(await games((data) => data.playoffSlot === slot))[0]?.data()

beforeAll(async () => {
	firestore = initTestApp()
	manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await firestore.collection('players').doc(ADMIN).set({ admin: true })
	await seasonRef().set({
		name: 'Season 5',
		dateStart: Timestamp.fromDate(new Date('2026-11-07T06:00:00Z')),
		dateEnd: Timestamp.fromDate(new Date('2026-12-20T06:00:00Z')),
		registrationStart: Timestamp.fromDate(new Date('2026-10-01T05:00:00Z')),
		registrationEnd: Timestamp.fromDate(new Date('2026-10-31T04:59:00Z')),
	})
	for (const [i, id] of TEAM_IDS.entries()) {
		await teamRef(id).set({ createdAt: Timestamp.now(), createdBy: null })
		await teamSeason(id).set({
			season: seasonRef(),
			name: `Team ${i + 1}`,
			logo: null,
			storagePath: null,
			registered: true,
			registeredDate: Timestamp.fromDate(
				new Date(Date.UTC(2026, 9, 1, 5, 0, i))
			),
			placement: null,
		})
		const playerId = `player-${i + 1}`
		await teamSeason(id)
			.collection('roster')
			.doc(playerId)
			.set({
				player: firestore.collection('players').doc(playerId),
				dateJoined: Timestamp.now(),
			})
		await firestore
			.collection('rankings')
			.doc(playerId)
			.set({ rating: 30 - i })
	}
})

describe('generateSchedule', () => {
	it('previews the season without creating anything', async () => {
		const preview = await generate(true)

		expect(preview.games).toHaveLength(48)
		expect(preview.regularNights).toEqual([
			'2026-11-07',
			'2026-11-14',
			'2026-11-21',
			'2026-12-05',
		])
		expect(preview.poolNight).toBe('2026-12-12')
		expect(preview.championshipNight).toBe('2026-12-19')
		expect(await games()).toHaveLength(0)
		expect((await seasonRef().get()).data()?.automaticPlayoffs).toBeUndefined()
	})

	it('creates every regular-season game, as createGame would store it', async () => {
		await generate()

		const stored = await games()
		expect(stored).toHaveLength(48)
		const first = stored.find(
			(doc) => doc.id === `${SEASON}_2026-11-08T00:00:00.000Z_1`
		)
		expect(first?.data()).toMatchObject({
			type: 'regular',
			field: 1,
			homeScore: null,
			awayScore: null,
			forfeit: null,
		})
		expect(first?.data().season.path).toBe(`seasons/${SEASON}`)
		expect(first?.data().home.path).toMatch(/^teams\/team-\d\d$/)
		expect(first?.data().homeName).toMatch(/^Team \d+$/)
		expect(first?.data().playoffSlot).toBeUndefined()
		expect((await seasonRef().get()).data()?.automaticPlayoffs).toBe(true)
	})

	it('refuses a season that already has games', async () => {
		await generate()
		expect(
			await errorCodeFrom(manifest.generateSchedule, {
				auth: authed(ADMIN),
				data: { seasonId: SEASON },
			})
		).toBe('failed-precondition')
		expect(await games()).toHaveLength(48)
	})

	it('refuses a Swiss season, and one without twelve teams', async () => {
		await seasonRef().update({ format: 'swiss' })
		expect(
			await errorCodeFrom(manifest.generateSchedule, {
				auth: authed(ADMIN),
				data: { seasonId: SEASON },
			})
		).toBe('failed-precondition')

		await seasonRef().update({ format: null })
		await teamSeason(TEAM_IDS[0]).update({ registered: false })
		expect(
			await errorCodeFrom(manifest.generateSchedule, {
				auth: authed(ADMIN),
				data: { seasonId: SEASON },
			})
		).toBe('failed-precondition')
		expect(await games()).toHaveLength(0)
	})
})

describe('the automatic playoffs', () => {
	beforeEach(async () => {
		await generate()
	})

	it('waits for the last regular-season score', async () => {
		const regular = await games()
		await scoreAll(regular.slice(0, 47))
		await fireTrigger(regular[46].id)

		expect(await playoffGames('pool-')).toHaveLength(0)
	})

	it('creates pool night when the last regular-season score is entered', async () => {
		const regular = await games()
		await scoreAll(regular)
		await fireTrigger(regular[47].id)

		const pool = await playoffGames('pool-')
		expect(pool).toHaveLength(12)
		const opener = await bySlot('pool-r1-f1')
		expect(opener).toMatchObject({ type: 'playoff', field: 1, homeScore: null })
		expect(opener?.date.toDate()).toEqual(new Date('2026-12-13T00:00:00Z'))

		// Its own writes fire it again, and that run does nothing.
		await fireTrigger(pool[0].id)
		expect(await playoffGames('pool-')).toHaveLength(12)
	})

	it('creates each game once when scores arrive together', async () => {
		const regular = await games()
		await scoreAll(regular)
		await Promise.all([
			updatePlayoffs(firestore, SEASON),
			updatePlayoffs(firestore, SEASON),
			updatePlayoffs(firestore, SEASON),
		])
		expect(await playoffGames('pool-')).toHaveLength(12)
	})

	/** Each pool slot's teams, "home v away". */
	const pairing = async () =>
		new Map(
			(await playoffGames('pool-')).map((doc) => [
				doc.data().playoffSlot as string,
				`${doc.data().home.id} v ${doc.data().away.id}`,
			])
		)
	/** The regular season rescored so the seeds come out reversed. */
	const reverseTheSeason = async () =>
		scoreAll(await games((d) => d.type === 'regular'), (home, away) =>
			home > away ? 'home' : 'away'
		)

	it('re-pairs pool night after a corrected score, until a game of it is played', async () => {
		await scoreAll(await games())
		await updatePlayoffs(firestore, SEASON)
		const before = await pairing()

		await reverseTheSeason()
		const summary = await updatePlayoffs(firestore, SEASON)
		const after = await pairing()

		const changed = [...after].filter(
			([slot, teams]) => before.get(slot) !== teams
		)
		expect(changed.length).toBeGreaterThan(0)
		expect(summary).toMatchObject({ updated: changed.length, kept: [] })
	})

	it('keeps pool night as paired once one of its games is played', async () => {
		await scoreAll(await games())
		await updatePlayoffs(firestore, SEASON)
		const before = await pairing()
		const opener = (await games((d) => d.playoffSlot === 'pool-r1-f1'))[0]
		await opener.ref.update({ homeScore: 13, awayScore: 9 })

		await reverseTheSeason()
		const summary = await updatePlayoffs(firestore, SEASON)

		// Re-pairing the rest would have teams meet twice or play three times.
		expect(await pairing()).toEqual(before)
		expect(summary.updated).toBe(0)
		expect(summary.kept.length).toBeGreaterThan(0)
	})

	it('runs the season through to every team’s placement', async () => {
		await scoreAll(await games())
		await updatePlayoffs(firestore, SEASON)
		await scoreAll(await playoffGames('pool-'))
		await updatePlayoffs(firestore, SEASON)

		const firstRounds = await playoffGames('championship-')
		expect(firstRounds).toHaveLength(6)
		await scoreAll(firstRounds)
		await updatePlayoffs(firestore, SEASON)

		const championship = await playoffGames('championship-')
		expect(championship).toHaveLength(12)
		await scoreAll(
			championship.filter((d) => /-r[34]-/.test(d.data().playoffSlot))
		)
		const summary = await updatePlayoffs(firestore, SEASON)

		expect(summary).toMatchObject({ placementsSet: 12, waitingFor: null })
		const placements = await Promise.all(
			TEAM_IDS.map(async (id) => (await teamSeason(id).get()).data()?.placement)
		)
		expect([...placements].sort((a, b) => a - b)).toEqual(
			Array.from({ length: 12 }, (_, i) => i + 1)
		)
		// The final on field 1 decides the champion.
		const final = await bySlot('championship-r4-f1')
		const champion =
			final?.homeScore > final?.awayScore ? final?.home.id : final?.away.id
		expect((await teamSeason(champion).get()).data()?.placement).toBe(1)

		// Nothing left to do.
		expect(await updatePlayoffs(firestore, SEASON)).toMatchObject({
			created: 0,
			updated: 0,
			placementsSet: 0,
		})
	})

	it('leaves a game an admin entered in a playoff slot alone, and says so', async () => {
		const regular = await games()
		await scoreAll(regular)
		const slotId = `${SEASON}_2026-12-13T00:00:00.000Z_1`
		await firestore
			.collection('games')
			.doc(slotId)
			.set({
				season: seasonRef(),
				date: Timestamp.fromDate(new Date('2026-12-13T00:00:00Z')),
				type: 'playoff',
				field: 1,
				home: teamRef(TEAM_IDS[5]),
				homeName: 'Team 6',
				away: teamRef(TEAM_IDS[6]),
				awayName: 'Team 7',
				homeScore: null,
				awayScore: null,
			})

		const summary = await updatePlayoffs(firestore, SEASON)

		expect(summary.conflicts).toEqual(['pool-r1-f1'])
		expect(summary.created).toBe(11)
		const kept = (await firestore.collection('games').doc(slotId).get()).data()
		expect(kept?.home.id).toBe(TEAM_IDS[5])
		expect(kept?.playoffSlot).toBeUndefined()

		// Moved to another field, it no longer holds the slot.
		await firestore
			.collection('games')
			.doc(slotId)
			.update({
				field: 3,
				date: Timestamp.fromDate(new Date('2026-12-05T23:00:00Z')),
			})
		const next = await updatePlayoffs(firestore, SEASON)
		expect(next).toMatchObject({ created: 1, conflicts: [] })
		expect(await bySlot('pool-r1-f1')).toMatchObject({ field: 1 })
	})

	it('never creates a second game where a moved one now stands', async () => {
		await scoreAll(await games())
		await updatePlayoffs(firestore, SEASON)
		await scoreAll(await playoffGames('pool-'))
		await updatePlayoffs(firestore, SEASON)
		// Field 1's opener is moved into its 7:30 slot, not yet created.
		const opener = (
			await games((d) => d.playoffSlot === 'championship-r1-f1')
		)[0]
		await opener.ref.update({
			date: Timestamp.fromDate(new Date('2026-12-20T01:30:00Z')),
		})
		await scoreAll(await playoffGames('championship-'))

		const summary = await updatePlayoffs(firestore, SEASON)

		expect(summary.conflicts).toContain('championship-r3-f1')
		const atSlot = await games(
			(d) =>
				d.field === 1 &&
				d.date.toDate().getTime() === new Date('2026-12-20T01:30:00Z').getTime()
		)
		expect(atSlot).toHaveLength(1)
	})

	it('updates the season a game was moved out of', async () => {
		const regular = await games()
		await scoreAll(regular)
		const moved = regular[0].data()
		const other = firestore.collection('seasons').doc('season-6')
		await other.set({ name: 'Season 6' })

		await manifest.updatePlayoffsOnGameChange.run({
			id: 'evt-move',
			params: { gameId: regular[0].id },
			data: {
				before: { exists: true, data: () => moved },
				after: { exists: true, data: () => ({ ...moved, season: other }) },
			},
		})

		expect(await playoffGames('pool-')).toHaveLength(12)
	})

	it('leaves a season it cannot schedule alone, without throwing', async () => {
		const regular = await games()
		await scoreAll(regular)
		await teamSeason(TEAM_IDS[0]).update({ registered: false })

		await expect(fireTrigger(regular[0].id)).resolves.toBeUndefined()
		expect(await playoffGames('pool-')).toHaveLength(0)
	})
})

describe('updatePlayoffs', () => {
	it('refuses a season whose schedule was not generated', async () => {
		expect(
			await errorCodeFrom(manifest.updatePlayoffs, {
				auth: authed(ADMIN),
				data: { seasonId: SEASON },
			})
		).toBe('failed-precondition')
	})

	it('reports what it would create without creating it', async () => {
		await generate()
		await scoreAll(await games())
		const summary = await call('updatePlayoffs', {
			seasonId: SEASON,
			dryRun: true,
		})
		expect(summary).toMatchObject({ created: 12 })
		expect(await playoffGames('pool-')).toHaveLength(0)
	})

	it('is ignored by the trigger for a season scheduled by hand', async () => {
		await firestore
			.collection('games')
			.doc('hand-made')
			.set({
				season: seasonRef(),
				date: Timestamp.fromDate(new Date('2026-11-08T00:00:00Z')),
				type: 'regular',
				field: 1,
				home: teamRef(TEAM_IDS[0]),
				homeName: 'Team 1',
				away: teamRef(TEAM_IDS[1]),
				awayName: 'Team 2',
				homeScore: 10,
				awayScore: 8,
			})
		const warn = vi.spyOn(logger, 'warn')
		try {
			await expect(fireTrigger('hand-made')).resolves.toBeUndefined()
			// Not even a warning: every game of every past season fires it.
			expect(warn).not.toHaveBeenCalled()
		} finally {
			warn.mockRestore()
		}
		expect(await games()).toHaveLength(1)
	})
})
