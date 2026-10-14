import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
	authed,
	DAY_MS,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	type Callable,
} from './helpers.js'

/**
 * A captain reminding the teammates who have not signed this season's
 * waiver. What matters: only that team's unsigned players are emailed,
 * never the captain or a signed player; only a captain of that team can
 * send; and a team sends one round a day, however many captains press.
 */

const SEASON = 'season-5'
const TEAM = 'team-1'
const OTHER_TEAM = 'team-2'

let firestore: Firestore
let remindUnsignedTeammates: Callable

const seasonRef = () => firestore.collection('seasons').doc(SEASON)
const teamSeason = (teamId = TEAM) =>
	firestore
		.collection('teams')
		.doc(teamId)
		.collection('teamSeasons')
		.doc(SEASON)

const remind = (uid: string, teamId = TEAM) =>
	remindUnsignedTeammates.run({
		auth: authed(uid),
		data: { teamId },
	} as never) as Promise<{ sent: number; nextReminderAt: string }>

const reminderCode = (uid: string, teamId = TEAM) =>
	errorCodeFrom(remindUnsignedTeammates, {
		auth: authed(uid),
		data: { teamId },
	})

const reminders = async () =>
	(
		await firestore
			.collection('mail')
			.where('template', '==', 'waiverReminder')
			.get()
	).docs.map((doc) => doc.data())

const seedMember = async (
	playerId: string,
	teamId: string,
	{ captain = false, signed = false } = {}
) => {
	const player = firestore.collection('players').doc(playerId)
	await player.set({
		admin: false,
		banned: false,
		firstname: playerId,
		lastname: 'Player',
	})
	await player
		.collection('playerSeasons')
		.doc(SEASON)
		.set({
			season: seasonRef(),
			team: firestore.collection('teams').doc(teamId),
			captain,
			paid: false,
			signed,
		})
	await teamSeason(teamId)
		.collection('roster')
		.doc(playerId)
		.set({ player, dateJoined: Timestamp.now() })
}

const seedTeam = (teamId: string, name: string) =>
	teamSeason(teamId).set({
		season: seasonRef(),
		name,
		logo: null,
		storagePath: null,
		registered: false,
		registeredDate: null,
		placement: null,
	})

beforeAll(async () => {
	firestore = initTestApp()
	const manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
	remindUnsignedTeammates = manifest.remindUnsignedTeammates as Callable
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seasonRef().set({
		name: 'Season 5',
		dateStart: Timestamp.fromMillis(Date.now() + 20 * DAY_MS),
		dateEnd: Timestamp.fromMillis(Date.now() + 60 * DAY_MS),
		registrationStart: Timestamp.fromMillis(Date.now() - 10 * DAY_MS),
		registrationEnd: Timestamp.fromMillis(Date.now() + 10 * DAY_MS),
	})
	await seedTeam(TEAM, 'Frost Giants')
	await seedTeam(OTHER_TEAM, 'Snow Owls')
	await seedMember('captain', TEAM, { captain: true })
	await seedMember('co-captain', TEAM, { captain: true, signed: true })
	await seedMember('signed', TEAM, { signed: true })
	await seedMember('unsigned-1', TEAM)
	await seedMember('unsigned-2', TEAM)
	await seedMember('elsewhere', OTHER_TEAM)
})

describe('remindUnsignedTeammates', () => {
	it('emails each unsigned teammate, never the captain or the signed', async () => {
		const result = await remind('captain')

		expect(result.sent).toBe(2)
		const mail = await reminders()
		expect(mail.map((m) => m.toPlayerId).sort()).toEqual([
			'unsigned-1',
			'unsigned-2',
		])
		expect(mail[0]).toMatchObject({
			category: 'registration',
			status: 'queued',
			props: {
				teamName: 'Frost Giants',
				seasonName: 'Season 5',
				captainName: 'captain Player',
				teamRegistered: false,
				signedPlayers: 2,
				signedPlayersNeeded: 10,
			},
		})
	})

	it('records the send, and says when the next one may go', async () => {
		const before = Date.now()
		const result = await remind('captain')

		const sentAt = (await teamSeason().get())
			.data()
			?.waiverReminderSentAt?.toMillis()
		expect(sentAt).toBeGreaterThanOrEqual(before)
		expect(new Date(result.nextReminderAt).getTime()).toBe(sentAt + DAY_MS)
	})

	it('sends one round a day for the team, whichever captain asks', async () => {
		await remind('captain')

		expect(await reminderCode('co-captain')).toBe('resource-exhausted')
		expect(await reminders()).toHaveLength(2)
	})

	it('sends again once a day has passed', async () => {
		await teamSeason().update({
			waiverReminderSentAt: Timestamp.fromMillis(Date.now() - DAY_MS - 1000),
		})

		await expect(remind('captain')).resolves.toMatchObject({ sent: 2 })
	})

	it('sends one round when two captains press at once', async () => {
		const outcomes = await Promise.allSettled([
			remind('captain'),
			remind('co-captain'),
		])

		const sent = outcomes.flatMap((o) =>
			o.status === 'fulfilled' ? [o.value.sent] : []
		)
		expect(sent).toHaveLength(1)
		// The co-captain's round includes the captain, who has not signed.
		expect(await reminders()).toHaveLength(sent[0])
	})

	it('refuses a player who is not a captain, or captains another team', async () => {
		expect(await reminderCode('unsigned-1')).toBe('permission-denied')
		await seedMember('other-captain', OTHER_TEAM, { captain: true })
		expect(await reminderCode('other-captain')).toBe('permission-denied')
		expect(await reminders()).toHaveLength(0)
	})

	it('says so when everyone has signed, and records no send', async () => {
		for (const id of ['captain', 'unsigned-1', 'unsigned-2']) {
			await firestore
				.collection('players')
				.doc(id)
				.collection('playerSeasons')
				.doc(SEASON)
				.update({ signed: true })
		}

		expect(await reminderCode('captain')).toBe('failed-precondition')
		expect((await teamSeason().get()).data()?.waiverReminderSentAt).toBe(
			undefined
		)
	})

	it('refuses once the season has ended', async () => {
		await seasonRef().update({
			dateEnd: Timestamp.fromMillis(Date.now() - DAY_MS),
		})

		expect(await reminderCode('captain')).toBe('failed-precondition')
		expect(await reminders()).toHaveLength(0)
	})

	it('refuses a request naming no team', async () => {
		expect(
			await errorCodeFrom(remindUnsignedTeammates, {
				auth: authed('captain'),
				data: {},
			})
		).toBe('invalid-argument')
	})
})
