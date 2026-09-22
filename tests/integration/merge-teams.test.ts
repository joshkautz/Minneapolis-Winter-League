import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
} from './helpers.js'
import { mergeTeams } from '../../Functions/src/index.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'

/**
 * `mergeTeams` is the widest write in the codebase. One call moves every
 * team-season subdoc and its roster, moves badges, rewrites every game and
 * offer that referenced the losing team, re-points every player's season
 * subdoc through the membership helpers, and then recursively deletes the
 * losing team.
 *
 * The delete is what makes this worth testing properly: it is the last step,
 * so anything the earlier steps failed to move is gone. It is also the one
 * operation here with no undo.
 */

const ADMIN = 'admin-uid'
const WINNER = 'winning-team'
const LOSER = 'losing-team'
const SEASON = 'season-1'

let firestore: Firestore

type MergeResponse = {
	movedTeamSeasons: number
	movedBadges: number
	badgesDeduped: number
	rewrittenGames: number
	rewrittenOffers: number
	rewrittenPlayerSeasons: number
}

const merge = async (
	winningTeamId = WINNER,
	losingTeamId = LOSER
): Promise<MergeResponse> =>
	(await mergeTeams.run({
		auth: authed(ADMIN),
		data: { winningTeamId, losingTeamId },
	} as unknown as CallableRequest<never>)) as MergeResponse

const teamRef = (teamId: string) => firestore.collection('teams').doc(teamId)
const seasonRef = (seasonId: string) =>
	firestore.collection('seasons').doc(seasonId)
const playerRef = (playerId: string) =>
	firestore.collection('players').doc(playerId)

const seedTeam = async (
	teamId: string,
	options: { createdAt?: Timestamp; createdBy?: string | null } = {}
) => {
	await teamRef(teamId).set({
		createdAt: options.createdAt ?? Timestamp.now(),
		createdBy: options.createdBy ? playerRef(options.createdBy) : null,
	})
}

const seedTeamSeason = async (
	teamId: string,
	seasonId: string,
	name: string
) => {
	await teamSeasonRef(firestore, teamId, seasonId).set({
		season: seasonRef(seasonId),
		name,
		logo: null,
		storagePath: null,
		registered: true,
		registeredDate: null,
		placement: 3,
	})
}

/** Puts a player on a team's roster and points their season subdoc back. */
const seedMembership = async (
	playerId: string,
	teamId: string,
	seasonId: string,
	options: { captain?: boolean } = {}
) => {
	await playerRef(playerId).set({
		admin: false,
		email: `${playerId}@example.com`,
		firstname: playerId,
		lastname: 'Player',
	})
	await teamRosterEntryRef(firestore, teamId, seasonId, playerId).set({
		player: playerRef(playerId),
		dateJoined: Timestamp.now(),
	})
	await playerSeasonRef(firestore, playerId, seasonId).set({
		season: seasonRef(seasonId),
		team: teamRef(teamId),
		captain: options.captain ?? false,
		paid: true,
		signed: true,
		banned: false,
	})
}

const readPlayerSeason = async (playerId: string, seasonId = SEASON) =>
	(await playerSeasonRef(firestore, playerId, seasonId).get()).data()

const rosterIds = async (teamId: string, seasonId = SEASON) =>
	(
		await teamSeasonRef(firestore, teamId, seasonId).collection('roster').get()
	).docs
		.map((doc) => doc.id)
		.sort()

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await playerRef(ADMIN).set({ admin: true, email: `${ADMIN}@example.com` })
	await seasonRef(SEASON).set({ name: '2030 Winter' })
	await seedTeam(WINNER)
	await seedTeam(LOSER)
})

describe('mergeTeams', () => {
	it('moves a season the losing team played and the winner did not', async () => {
		await seedTeamSeason(LOSER, SEASON, 'Old Name')

		const result = await merge()
		const moved = await teamSeasonRef(firestore, WINNER, SEASON).get()

		expect(result.movedTeamSeasons).toBe(1)
		expect(moved.data()?.name).toBe('Old Name')
		expect(moved.data()?.placement).toBe(3)
	})

	it('moves the roster along with the season', async () => {
		await seedTeamSeason(LOSER, SEASON, 'Old Name')
		await seedMembership('player-1', LOSER, SEASON)
		await seedMembership('player-2', LOSER, SEASON, { captain: true })

		await merge()

		expect(await rosterIds(WINNER)).toEqual(['player-1', 'player-2'])
	})

	it('re-points each player season at the winning team', async () => {
		await seedTeamSeason(LOSER, SEASON, 'Old Name')
		await seedMembership('player-1', LOSER, SEASON)

		const result = await merge()

		expect(result.rewrittenPlayerSeasons).toBe(1)
		expect((await readPlayerSeason('player-1'))?.team.path).toBe(
			`teams/${WINNER}`
		)
	})

	it('keeps a captain a captain', async () => {
		await seedTeamSeason(LOSER, SEASON, 'Old Name')
		await seedMembership('captain-1', LOSER, SEASON, { captain: true })

		await merge()

		expect((await readPlayerSeason('captain-1'))?.captain).toBe(true)
	})

	it('leaves both sides of the membership agreeing', async () => {
		// The player/team relationship is written on both sides. A merge that
		// updates one and not the other leaves a roster entry with no player
		// pointing back, which nothing else in the system would notice.
		await seedTeamSeason(LOSER, SEASON, 'Old Name')
		await seedMembership('player-1', LOSER, SEASON)

		await merge()

		expect(await rosterIds(WINNER)).toEqual(['player-1'])
		expect((await readPlayerSeason('player-1'))?.team.path).toBe(
			`teams/${WINNER}`
		)
		// The losing side is empty because the team is recursively deleted at
		// the end, not because of the removePlayerFromTeam call — that call is
		// redundant here and removing it does not fail any test.
		expect(await rosterIds(LOSER)).toEqual([])
	})

	it('preserves the original join date through a merge', async () => {
		// The roster entry's dateJoined is the record of when someone joined
		// that team for that season. A merge is an administrative tidy-up, not
		// a re-join, so stamping it with the merge's own time would rewrite
		// history for every player on the team.
		const originalJoin = Timestamp.fromMillis(1_000)
		await seedTeamSeason(LOSER, SEASON, 'Old Name')
		await seedMembership('player-1', LOSER, SEASON)
		await teamRosterEntryRef(firestore, LOSER, SEASON, 'player-1').update({
			dateJoined: originalJoin,
		})

		await merge()
		const entry = await teamRosterEntryRef(
			firestore,
			WINNER,
			SEASON,
			'player-1'
		).get()

		expect(entry.data()?.dateJoined.toMillis()).toBe(1_000)
	})

	it('preserves a separate join date per season', async () => {
		await seasonRef('season-2').set({ name: '2031 Winter' })
		await seedTeamSeason(LOSER, SEASON, 'Old Name')
		await seedTeamSeason(LOSER, 'season-2', 'Old Name')
		await seedMembership('player-1', LOSER, SEASON)
		await seedMembership('player-1', LOSER, 'season-2')
		await teamRosterEntryRef(firestore, LOSER, SEASON, 'player-1').update({
			dateJoined: Timestamp.fromMillis(1_000),
		})
		await teamRosterEntryRef(firestore, LOSER, 'season-2', 'player-1').update({
			dateJoined: Timestamp.fromMillis(2_000),
		})

		await merge()

		expect(
			(await teamRosterEntryRef(firestore, WINNER, SEASON, 'player-1').get())
				.data()
				?.dateJoined.toMillis()
		).toBe(1_000)
		expect(
			(
				await teamRosterEntryRef(
					firestore,
					WINNER,
					'season-2',
					'player-1'
				).get()
			)
				.data()
				?.dateJoined.toMillis()
		).toBe(2_000)
	})

	it('rewrites games that the losing team played at home and away', async () => {
		await seedTeamSeason(LOSER, SEASON, 'Old Name')
		await firestore
			.collection('games')
			.doc('game-home')
			.set({
				season: seasonRef(SEASON),
				home: teamRef(LOSER),
				away: null,
				homeName: 'Old Name',
				awayName: null,
				homeScore: 15,
				awayScore: 10,
				field: 1,
				type: 'regular',
				date: Timestamp.now(),
			})
		await firestore
			.collection('games')
			.doc('game-away')
			.set({
				season: seasonRef(SEASON),
				home: null,
				away: teamRef(LOSER),
				homeName: null,
				awayName: 'Old Name',
				homeScore: 10,
				awayScore: 15,
				field: 2,
				type: 'regular',
				date: Timestamp.now(),
			})

		const result = await merge()
		const games = await firestore.collection('games').get()

		expect(result.rewrittenGames).toBe(2)
		expect(games.docs.find((d) => d.id === 'game-home')?.data().home.path).toBe(
			`teams/${WINNER}`
		)
		expect(games.docs.find((d) => d.id === 'game-away')?.data().away.path).toBe(
			`teams/${WINNER}`
		)
	})

	it('leaves the denormalized game names alone', async () => {
		// The name is a snapshot of the team-season, and that subdoc moves to
		// the winner unchanged — so the historical name is still correct and
		// rewriting it would lose it.
		await seedTeamSeason(LOSER, SEASON, 'Old Name')
		await firestore
			.collection('games')
			.doc('game-1')
			.set({
				season: seasonRef(SEASON),
				home: teamRef(LOSER),
				away: null,
				homeName: 'Old Name',
				awayName: null,
				homeScore: 15,
				awayScore: 10,
				field: 1,
				type: 'regular',
				date: Timestamp.now(),
			})

		await merge()

		expect(
			(await firestore.collection('games').doc('game-1').get()).data()?.homeName
		).toBe('Old Name')
	})

	it('rewrites offers addressed to the losing team', async () => {
		await seedTeamSeason(LOSER, SEASON, 'Old Name')
		await playerRef('player-1').set({ admin: false, email: 'p1@example.com' })
		await firestore
			.collection('offers')
			.doc('offer-1')
			.set({
				player: playerRef('player-1'),
				team: teamRef(LOSER),
				season: seasonRef(SEASON),
				status: 'pending',
				type: 'invitation',
				createdAt: Timestamp.now(),
			})

		const result = await merge()

		expect(result.rewrittenOffers).toBe(1)
		expect(
			(await firestore.collection('offers').doc('offer-1').get()).data()?.team
				.path
		).toBe(`teams/${WINNER}`)
	})

	it('moves badges the winner does not already hold', async () => {
		await teamRef(LOSER)
			.collection('badges')
			.doc('badge-1')
			.set({
				badge: firestore.collection('badges').doc('badge-1'),
				awardedAt: Timestamp.fromMillis(1_000),
				awardedBy: playerRef(ADMIN),
				seasonId: SEASON,
			})

		const result = await merge()

		expect(result.movedBadges).toBe(1)
		expect(
			(await teamRef(WINNER).collection('badges').doc('badge-1').get()).exists
		).toBe(true)
	})

	it('keeps the earlier award when both teams hold a badge', async () => {
		// Badges like "Forefathers" are about when a team first earned them,
		// so a merge should end up with the older of the two dates.
		for (const [teamId, millis] of [
			[WINNER, 5_000],
			[LOSER, 1_000],
		] as const) {
			await teamRef(teamId)
				.collection('badges')
				.doc('badge-1')
				.set({
					badge: firestore.collection('badges').doc('badge-1'),
					awardedAt: Timestamp.fromMillis(millis),
					awardedBy: playerRef(ADMIN),
					seasonId: SEASON,
				})
		}

		const result = await merge()
		const badge = await teamRef(WINNER)
			.collection('badges')
			.doc('badge-1')
			.get()

		expect(result.badgesDeduped).toBe(1)
		expect(result.movedBadges).toBe(0)
		expect(badge.data()?.awardedAt.toMillis()).toBe(1_000)
	})

	it('keeps the winner’s award when it is the earlier one', async () => {
		for (const [teamId, millis] of [
			[WINNER, 1_000],
			[LOSER, 5_000],
		] as const) {
			await teamRef(teamId)
				.collection('badges')
				.doc('badge-1')
				.set({
					badge: firestore.collection('badges').doc('badge-1'),
					awardedAt: Timestamp.fromMillis(millis),
					awardedBy: playerRef(ADMIN),
					seasonId: SEASON,
				})
		}

		await merge()
		const badge = await teamRef(WINNER)
			.collection('badges')
			.doc('badge-1')
			.get()

		expect(badge.data()?.awardedAt.toMillis()).toBe(1_000)
	})

	it('back-fills the winner’s founding date from an older losing team', async () => {
		await resetFirestore(firestore)
		await playerRef(ADMIN).set({ admin: true, email: `${ADMIN}@example.com` })
		await seasonRef(SEASON).set({ name: '2030 Winter' })
		await seedTeam(WINNER, { createdAt: Timestamp.fromMillis(9_000) })
		await seedTeam(LOSER, {
			createdAt: Timestamp.fromMillis(1_000),
			createdBy: 'founder',
		})

		await merge()
		const winner = await teamRef(WINNER).get()

		expect(winner.data()?.createdAt.toMillis()).toBe(1_000)
		expect(winner.data()?.createdBy.path).toBe('players/founder')
	})

	it('keeps the winner’s founding date when it is already older', async () => {
		await resetFirestore(firestore)
		await playerRef(ADMIN).set({ admin: true, email: `${ADMIN}@example.com` })
		await seasonRef(SEASON).set({ name: '2030 Winter' })
		await seedTeam(WINNER, {
			createdAt: Timestamp.fromMillis(1_000),
			createdBy: 'original-founder',
		})
		await seedTeam(LOSER, {
			createdAt: Timestamp.fromMillis(9_000),
			createdBy: 'later-founder',
		})

		await merge()
		const winner = await teamRef(WINNER).get()

		expect(winner.data()?.createdAt.toMillis()).toBe(1_000)
		expect(winner.data()?.createdBy.path).toBe('players/original-founder')
	})

	it('deletes the losing team and everything under it', async () => {
		await seedTeamSeason(LOSER, SEASON, 'Old Name')
		await seedMembership('player-1', LOSER, SEASON)

		await merge()

		expect((await teamRef(LOSER).get()).exists).toBe(false)
		expect((await teamRef(LOSER).collection('teamSeasons').get()).empty).toBe(
			true
		)
	})

	it('merges a team with several seasons in one call', async () => {
		await seasonRef('season-2').set({ name: '2031 Winter' })
		await seedTeamSeason(LOSER, SEASON, 'Old Name')
		await seedTeamSeason(LOSER, 'season-2', 'Newer Name')
		await seedMembership('player-1', LOSER, SEASON)
		await seedMembership('player-1', LOSER, 'season-2')

		const result = await merge()

		expect(result.movedTeamSeasons).toBe(2)
		expect(await rosterIds(WINNER, SEASON)).toEqual(['player-1'])
		expect(await rosterIds(WINNER, 'season-2')).toEqual(['player-1'])
	})

	it('refuses when both teams played the same season', async () => {
		// The two would have to be reconciled into one roster, one placement
		// and one name, which is a judgement call rather than a merge.
		await seedTeamSeason(WINNER, SEASON, 'Winner Name')
		await seedTeamSeason(LOSER, SEASON, 'Loser Name')

		expect(
			await errorCodeFrom(mergeTeams, {
				auth: authed(ADMIN),
				data: { winningTeamId: WINNER, losingTeamId: LOSER },
			})
		).toBe('failed-precondition')
	})

	it('writes nothing when it refuses a colliding merge', async () => {
		await seedTeamSeason(WINNER, SEASON, 'Winner Name')
		await seedTeamSeason(LOSER, SEASON, 'Loser Name')
		await seedMembership('player-1', LOSER, SEASON)

		await errorCodeFrom(mergeTeams, {
			auth: authed(ADMIN),
			data: { winningTeamId: WINNER, losingTeamId: LOSER },
		})

		expect((await teamRef(LOSER).get()).exists).toBe(true)
		expect(await rosterIds(LOSER)).toEqual(['player-1'])
		expect(
			(await teamSeasonRef(firestore, WINNER, SEASON).get()).data()?.name
		).toBe('Winner Name')
	})

	it('refuses to merge a team into itself', async () => {
		expect(
			await errorCodeFrom(mergeTeams, {
				auth: authed(ADMIN),
				data: { winningTeamId: WINNER, losingTeamId: WINNER },
			})
		).toBe('invalid-argument')
	})

	it.each([
		['winning', { winningTeamId: 'ghost', losingTeamId: LOSER }],
		['losing', { winningTeamId: WINNER, losingTeamId: 'ghost' }],
	])('refuses when the %s team does not exist', async (_which, data) => {
		expect(await errorCodeFrom(mergeTeams, { auth: authed(ADMIN), data })).toBe(
			'not-found'
		)
	})

	it('refuses while a data migration is in progress', async () => {
		// The kill-switch every trigger honours. A merge running against a
		// half-migrated database would move documents into the shape the
		// migration is on its way out of.
		await firestore
			.collection('system')
			.doc('maintenance')
			.set({ migrationInProgress: true })

		expect(
			await errorCodeFrom(mergeTeams, {
				auth: authed(ADMIN),
				data: { winningTeamId: WINNER, losingTeamId: LOSER },
			})
		).toBe('failed-precondition')
		expect((await teamRef(LOSER).get()).exists).toBe(true)
	})

	it('succeeds on a team with nothing attached to it', async () => {
		const result = await merge()

		expect(result.movedTeamSeasons).toBe(0)
		expect((await teamRef(LOSER).get()).exists).toBe(false)
	})
})
