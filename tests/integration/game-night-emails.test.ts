import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import { emailGameNightsWeekly } from '../../Functions/src/index.js'
import { queueGameNightEmails } from '../../Functions/src/email/gameNightEmails.js'

/**
 * The Thursday game-night email, against the emulator. What matters: each
 * rostered player on a team that plays that Saturday gets one email, nobody
 * else gets any, a rerun sends nothing twice, and a week
 * without a game night sends nothing at all. No email leaves: the sender
 * trigger is not running.
 */

const SEASON = 'season-5'

let firestore: Firestore

const seasonRef = () => firestore.collection('seasons').doc(SEASON)
const teamRef = (id: string) => firestore.collection('teams').doc(id)

/** Noon on a Minneapolis Thursday (CST). */
const thursdayNoon = (day: string) => new Date(`${day}T18:00:00Z`)

interface QueuedMail {
	id: string
	toPlayerId: string
	category: string
	props: Record<string, unknown>
}

const queued = async (): Promise<QueuedMail[]> =>
	(
		await firestore
			.collection('mail')
			.where('template', '==', 'gameNight')
			.get()
	).docs.map((doc) => ({ id: doc.id, ...doc.data() }) as QueuedMail)

const seedTeam = async (
	id: string,
	name: string,
	registered: boolean,
	players: string[]
) => {
	await teamRef(id).set({ createdBy: null })
	const teamSeason = teamRef(id).collection('teamSeasons').doc(SEASON)
	await teamSeason.set({
		season: seasonRef(),
		name,
		logo: null,
		storagePath: null,
		registered,
		registeredDate: null,
		placement: null,
		standingsRank: registered ? 1 : null,
	})
	for (const playerId of players) {
		await teamSeason
			.collection('roster')
			.doc(playerId)
			.set({
				player: firestore.collection('players').doc(playerId),
				dateJoined: Timestamp.now(),
			})
	}
}

/** A game at 6pm Minneapolis time (CST) on `day`. */
const seedGame = (day: string, home: string, away: string) =>
	firestore.collection('games').add({
		season: seasonRef(),
		date: Timestamp.fromDate(new Date(`${day}T18:00:00-06:00`)),
		field: 1,
		type: 'regular',
		home: teamRef(home),
		away: teamRef(away),
		homeName: null,
		awayName: null,
		homeScore: null,
		awayScore: null,
	})

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seasonRef().set({
		name: 'Season 5',
		dateStart: Timestamp.fromDate(new Date('2026-11-07T06:00:00Z')),
		dateEnd: Timestamp.fromDate(new Date('2026-12-20T06:00:00Z')),
		registrationStart: Timestamp.fromDate(new Date('2026-10-01T05:00:00Z')),
		registrationEnd: Timestamp.fromDate(new Date('2026-10-31T04:59:00Z')),
	})
	await seedTeam('goop', 'Goop', true, ['p1', 'p2'])
	await seedTeam('owls', 'Snow Owls', true, ['p3'])
	await seedTeam('late', 'Too Late', false, ['p4'])
	await seedGame('2026-11-14', 'goop', 'owls')
})

describe('queueGameNightEmails', () => {
	it('emails each rostered player on a team that plays that Saturday', async () => {
		const summary = await queueGameNightEmails(firestore, {
			now: thursdayNoon('2026-11-12'),
		})

		expect(summary).toEqual({
			night: '2026-11-14',
			teams: 2,
			queued: 3,
			alreadyQueued: 0,
		})
		const mail = await queued()
		expect(mail.map((m) => m.toPlayerId).sort()).toEqual(['p1', 'p2', 'p3'])
		const goop = mail.find((m) => m.toPlayerId === 'p1')
		expect(goop).toMatchObject({
			id: 'gameNight-season-5-2026-11-14-p1',
			category: 'games',
			props: {
				teamName: 'Goop',
				nightLabel: 'Week 1',
				nightDate: 'Saturday, November 14',
				games: [{ time: '6:00pm', field: 1, opponent: 'Snow Owls' }],
			},
		})
	})

	it('emails nobody twice, however often it runs', async () => {
		const now = thursdayNoon('2026-11-12')
		await queueGameNightEmails(firestore, { now })

		await expect(
			queueGameNightEmails(firestore, { now })
		).resolves.toMatchObject({ queued: 0, alreadyQueued: 3 })
		expect(await queued()).toHaveLength(3)
	})

	it('counts without queueing on a dry run', async () => {
		await expect(
			queueGameNightEmails(firestore, {
				now: thursdayNoon('2026-11-12'),
				dryRun: true,
			})
		).resolves.toMatchObject({ teams: 2, queued: 3 })
		expect(await queued()).toHaveLength(0)
	})

	it('sends nothing in a week without a game night', async () => {
		await expect(
			queueGameNightEmails(firestore, { now: thursdayNoon('2026-11-26') })
		).resolves.toEqual({ night: null, teams: 0, queued: 0, alreadyQueued: 0 })
		expect(await queued()).toHaveLength(0)
	})

	it('sends nothing for a night whose games do not exist yet', async () => {
		await expect(
			queueGameNightEmails(firestore, { now: thursdayNoon('2026-11-19') })
		).resolves.toEqual({
			night: '2026-11-21',
			teams: 0,
			queued: 0,
			alreadyQueued: 0,
		})
	})
})

describe('emailGameNightsWeekly', () => {
	it('queues the coming night’s emails when it runs on Thursday', async () => {
		await emailGameNightsWeekly.run({
			scheduleTime: thursdayNoon('2026-11-12').toISOString(),
		} as never)

		expect(await queued()).toHaveLength(3)
	})

	it('does nothing while a migration is in progress', async () => {
		await firestore.doc('system/maintenance').set({ migrationInProgress: true })

		await emailGameNightsWeekly.run({
			scheduleTime: thursdayNoon('2026-11-12').toISOString(),
		} as never)

		expect(await queued()).toHaveLength(0)
	})
})
