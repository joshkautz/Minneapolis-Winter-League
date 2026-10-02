import { initializeApp } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	PROJECT_ID,
	resetFirestore,
	type Callable,
} from './helpers.js'
import { BADGES } from '../../Functions/src/badges/catalog.js'
import { rebuildBadges } from '../../Functions/src/services/badges/rebuild.js'

/**
 * The badges rebuild against the emulator: that the awards it writes are
 * exactly the rules' — at the paths the team page reads, kept when nothing
 * changed, removed when the data no longer supports them — and that it
 * clears out the hand-awarded badges it replaced.
 */

// The helpers' app has no bucket; this one is created first, so theirs is it.
initializeApp({
	projectId: PROJECT_ID,
	storageBucket: `${PROJECT_ID}.appspot.com`,
})

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const SEASON = 'season-1'
const ADMIN = 'admin-1'
const AFTER_THE_SEASON = new Date('2031-01-01T00:00:00Z')

const seasonRef = () => firestore.collection('seasons').doc(SEASON)
const teamRef = (id: string) => firestore.collection('teams').doc(id)
const badges = async (teamId: string) =>
	(await teamRef(teamId).collection('badges').get()).docs

const seedTeam = async (teamId: string, name: string) => {
	await teamRef(teamId).set({ createdAt: Timestamp.now(), createdBy: null })
	await teamRef(teamId)
		.collection('teamSeasons')
		.doc(SEASON)
		.set({
			season: seasonRef(),
			name,
			logo: null,
			storagePath: null,
			registered: true,
			registeredDate: Timestamp.fromDate(new Date('2030-10-02T15:00:00Z')),
			placement: null,
		})
}

const seedGame = (id: string, homeScore: number, awayScore: number) =>
	firestore
		.collection('games')
		.doc(id)
		.set({
			season: seasonRef(),
			date: Timestamp.fromDate(new Date('2030-11-09T18:00:00Z')),
			type: 'regular',
			field: 1,
			home: teamRef('frost'),
			homeName: 'Frost Giants',
			away: teamRef('owls'),
			awayName: 'Snow Owls',
			homeScore,
			awayScore,
		})

const rebuild = (now = AFTER_THE_SEASON) => rebuildBadges(firestore, { now })

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
		name: '2030 Fall',
		dateStart: Timestamp.fromDate(new Date('2030-11-02T05:00:00Z')),
		dateEnd: Timestamp.fromDate(new Date('2030-12-21T06:00:00Z')),
		registrationStart: Timestamp.fromDate(new Date('2030-10-01T05:00:00Z')),
		registrationEnd: Timestamp.fromDate(new Date('2030-10-31T04:59:00Z')),
	})
	await seedTeam('frost', 'Frost Giants')
	await seedTeam('owls', 'Snow Owls')
	await seedGame('game-1', 10, 9)
})

describe('rebuildBadges', () => {
	it('writes each award at the team’s badge path, with how it was earned', async () => {
		await rebuild()

		const award = (
			await teamRef('frost')
				.collection('badges')
				.doc(`universe-point_${SEASON}`)
				.get()
		).data()
		expect(award).toMatchObject({
			badgeId: 'universe-point',
			seasonId: SEASON,
			reason: 'Beat Snow Owls 10–9 on November 9.',
		})
		expect(award?.season.path).toBe(`seasons/${SEASON}`)
		expect(award?.earnedAt.toDate()).toEqual(new Date('2030-11-09T18:00:00Z'))
	})

	it('changes nothing when run again on the same data', async () => {
		const first = await rebuild()
		const second = await rebuild()

		expect(first.created).toBeGreaterThan(0)
		expect(second).toMatchObject({ created: 0, updated: 0, removed: 0 })
		expect(second.awards).toBe(first.awards)
	})

	it('removes an award once a corrected score no longer supports it', async () => {
		await rebuild()
		await seedGame('game-1', 10, 5)

		const summary = await rebuild()

		const ids = (await badges('frost')).map((doc) => doc.id)
		expect(ids).not.toContain(`universe-point_${SEASON}`)
		expect(summary.removed).toBeGreaterThanOrEqual(1)
	})

	it('ignores a forfeited game', async () => {
		await firestore
			.collection('games')
			.doc('game-1')
			.update({ forfeit: 'away' })

		await rebuild()

		expect(
			(await badges('frost'))
				.map((doc) => doc.id)
				.filter((id) => id.startsWith('universe-point'))
		).toEqual([])
	})

	it('replaces the hand-awarded badges and their definitions', async () => {
		// The shapes from before badges were automatic.
		await teamRef('frost')
			.collection('badges')
			.doc('old-badge')
			.set({
				badge: firestore.collection('badges').doc('old-badge'),
				awardedAt: Timestamp.now(),
				seasonId: SEASON,
			})
		const image = 'badges/old-badge-1234.png'
		await getStorage().bucket().file(image).save(Buffer.from('png'))
		await firestore.collection('badges').doc('old-badge').set({
			name: 'Old Badge',
			storagePath: image,
		})

		const summary = await rebuild()

		expect((await badges('frost')).map((doc) => doc.id)).not.toContain(
			'old-badge'
		)
		expect((await firestore.doc('badges/old-badge').get()).exists).toBe(false)
		expect((await getStorage().bucket().file(image).exists())[0]).toBe(false)
		expect(summary.retiredBadges).toBe(1)
	})

	it('counts the teams that hold each badge', async () => {
		await rebuild()

		const earned = (await firestore.doc('badges/universe-point').get()).data()
		expect(earned).toMatchObject({ teamsEarned: 1, timesEarned: 1 })
		const unearned = (await firestore.doc('badges/dynasty').get()).data()
		expect(unearned).toMatchObject({ teamsEarned: 0, timesEarned: 0 })
		expect((await firestore.collection('badges').get()).size).toBe(
			BADGES.length
		)
	})
})

describe('the rebuildBadges callable', () => {
	const call = (data: Record<string, unknown>) =>
		(manifest.rebuildBadges as Callable).run({
			auth: authed(ADMIN),
			data,
		} as unknown as CallableRequest<never>)

	it('reports what it would change without writing, on a dry run', async () => {
		const summary = (await call({ dryRun: true })) as { created: number }

		expect(summary.created).toBeGreaterThan(0)
		expect(await badges('frost')).toEqual([])
	})

	it('refuses a dryRun that is not a boolean', async () => {
		expect(
			await errorCodeFrom(manifest.rebuildBadges, {
				auth: authed(ADMIN),
				data: { dryRun: 'yes' },
			})
		).toBe('invalid-argument')
	})
})

describe('awardBadgesNightly', () => {
	const runNightly = (scheduleTime: Date) =>
		manifest.awardBadgesNightly.run({
			scheduleTime: scheduleTime.toISOString(),
		} as never)

	it('awards badges as of the night it runs', async () => {
		await runNightly(AFTER_THE_SEASON)

		expect((await badges('frost')).map((doc) => doc.id)).toContain(
			`universe-point_${SEASON}`
		)
	})

	it('skips a night while a migration is in progress', async () => {
		await firestore.doc('system/maintenance').set({ migrationInProgress: true })

		await runNightly(AFTER_THE_SEASON)

		expect(await badges('frost')).toEqual([])
	})
})
