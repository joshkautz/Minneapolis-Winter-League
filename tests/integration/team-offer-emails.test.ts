import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
	authed,
	type Callable,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
} from './helpers.js'
import { fakeResend, seedEmailPlayer, setEmailMode } from './email-helpers.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'
import { deliverQueuedEmail } from '../../Functions/src/email/sender.js'

/**
 * The emails around joining a team. Each is queued in the transaction that
 * makes the change, so these run the real callables and trigger and read
 * the outbox:
 *
 * - an invitation emails the player; a request emails every captain
 * - accepting or declining emails whoever sent it
 * - canceling, and anything refused, emails nobody
 * - re-sending an offer within a day of withdrawing it emails nobody
 */

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const fn = (name: string): Callable => manifest[name] as Callable

const SEASON = 'season-1'
const PAST_SEASON = 'season-0'
const TEAM = 'team-1'
const OTHER_TEAM = 'team-2'
const CAPTAIN = 'captain-1'
const CO_CAPTAIN = 'captain-2'
const TEAMMATE = 'teammate-1'
const PAST_CAPTAIN = 'past-captain'
const PLAYER = 'free-agent'

const daysFromNow = (days: number): Timestamp =>
	Timestamp.fromDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000))

const seasonRef = (id = SEASON) => firestore.collection('seasons').doc(id)
const teamRef = (id = TEAM) => firestore.collection('teams').doc(id)

interface QueuedMail {
	id: string
	toPlayerId: string | null
	template: string
	category: string
	props: Record<string, unknown>
}

const outbox = async (): Promise<QueuedMail[]> =>
	(await firestore.collection('mail').get()).docs.map((doc) => ({
		id: doc.id,
		...(doc.data() as Omit<QueuedMail, 'id'>),
	}))

/** Who was sent which template, sorted so tests can compare whole lists. */
const sentTo = async (): Promise<[string | null, string][]> =>
	(await outbox())
		.map((mail): [string | null, string] => [mail.toPlayerId, mail.template])
		.sort(([a], [b]) => String(a).localeCompare(String(b)))

const putOnTeam = async (
	playerId: string,
	teamId: string,
	seasonId: string,
	captain: boolean
): Promise<void> => {
	await playerSeasonRef(firestore, playerId, seasonId).set({
		season: seasonRef(seasonId),
		team: teamRef(teamId),
		captain,
		paid: false,
		signed: false,
	})
	await teamRosterEntryRef(firestore, teamId, seasonId, playerId).set({
		player: firestore.collection('players').doc(playerId),
		dateJoined: Timestamp.now(),
	})
}

const seedPlayer = async (
	id: string,
	firstname: string,
	lastname: string
): Promise<void> => {
	await seedEmailPlayer(firestore, id)
	await firestore
		.collection('players')
		.doc(id)
		.set({ firstname, lastname }, { merge: true })
}

const createOffer = (
	caller: string,
	type: 'invitation' | 'request',
	teamId = TEAM
) =>
	errorCodeFrom(fn('createOffer'), {
		auth: authed(caller),
		data: { playerId: PLAYER, teamId, type },
	})

const offerId = (teamId = TEAM) => `${PLAYER}_${teamId}_${SEASON}_pending`

const answer = (caller: string, status: 'accepted' | 'rejected' | 'canceled') =>
	errorCodeFrom(fn('updateOffer'), {
		auth: authed(caller),
		data: { offerId: offerId(), status },
	})

/** Runs onOfferUpdated as Firestore would after an offer's status changes. */
const fireTrigger = async (before: string, after: string): Promise<void> => {
	const offer = (
		await firestore.collection('offers').doc(offerId()).get()
	).data()
	const snap = (status: string) => ({
		exists: true,
		data: () => ({ ...offer, status }),
	})
	await manifest.onOfferUpdated.run({
		id: 'evt-1',
		params: { offerId: offerId() },
		data: { before: snap(before), after: snap(after) },
	})
}

/** Deletes the outbox, so a test sees only what its own step queued. */
const clearOutbox = () =>
	firestore.recursiveDelete(firestore.collection('mail'))

beforeAll(async () => {
	firestore = initTestApp()
	manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await setEmailMode(firestore, 'live')
	await seasonRef(PAST_SEASON).set({
		name: '2025 Fall',
		dateStart: daysFromNow(-400),
		dateEnd: daysFromNow(-300),
		registrationStart: daysFromNow(-450),
		registrationEnd: daysFromNow(-410),
	})
	await seasonRef().set({
		name: '2026 Fall',
		dateStart: daysFromNow(30),
		dateEnd: daysFromNow(90),
		registrationStart: daysFromNow(-10),
		registrationEnd: daysFromNow(10),
	})
	for (const teamId of [TEAM, OTHER_TEAM]) {
		await teamRef(teamId).set({ createdAt: Timestamp.now(), createdBy: null })
		await teamSeasonRef(firestore, teamId, SEASON).set({
			season: seasonRef(),
			name: teamId === TEAM ? 'Frost Giants' : 'Snow Owls',
			logo: null,
			storagePath: null,
			registered: false,
			registeredDate: null,
			placement: null,
		})
	}
	await seedPlayer(CAPTAIN, 'Sam', 'Rivera')
	await seedPlayer(CO_CAPTAIN, 'Jo', 'Park')
	await seedPlayer(TEAMMATE, 'Lee', 'Moss')
	await seedPlayer(PAST_CAPTAIN, 'Pat', 'Old')
	await seedPlayer(PLAYER, 'Alex', 'Chen')
	await putOnTeam(CAPTAIN, TEAM, SEASON, true)
	await putOnTeam(CO_CAPTAIN, TEAM, SEASON, true)
	await putOnTeam(TEAMMATE, TEAM, SEASON, false)
	// Captained the same team last season, and is not on it now.
	await putOnTeam(PAST_CAPTAIN, TEAM, PAST_SEASON, true)
})

describe('sending an invitation', () => {
	it('emails the invited player, naming the captain, team and season', async () => {
		expect(await createOffer(CAPTAIN, 'invitation')).toBeNull()

		const mail = await outbox()
		expect(mail).toHaveLength(1)
		expect(mail[0]).toMatchObject({
			toPlayerId: PLAYER,
			template: 'teamInvitation',
			category: 'teams',
			props: {
				captainName: 'Sam Rivera',
				teamName: 'Frost Giants',
				seasonName: '2026 Fall',
			},
		})
	})

	it('emails nobody when the invitation is refused', async () => {
		// Only a captain may invite.
		expect(await createOffer(TEAMMATE, 'invitation')).toBe('permission-denied')
		expect(await outbox()).toEqual([])
	})

	it('emails nobody for a second invitation while the first is pending', async () => {
		await createOffer(CAPTAIN, 'invitation')
		await clearOutbox()

		expect(await createOffer(CO_CAPTAIN, 'invitation')).toBe('already-exists')
		expect(await outbox()).toEqual([])
	})
})

describe('sending a request', () => {
	it('emails every captain of the team this season, and only them', async () => {
		expect(await createOffer(PLAYER, 'request')).toBeNull()

		// Not the teammate, not last season's captain, not the player.
		expect(await sentTo()).toEqual([
			[CAPTAIN, 'teamJoinRequest'],
			[CO_CAPTAIN, 'teamJoinRequest'],
		])
		expect((await outbox())[0].props).toEqual({
			playerName: 'Alex Chen',
			teamName: 'Frost Giants',
			seasonName: '2026 Fall',
		})
	})

	it('emails nobody when the request is refused', async () => {
		await putOnTeam(PLAYER, OTHER_TEAM, SEASON, false)

		expect(await createOffer(PLAYER, 'request')).toBe('already-exists')
		expect(await outbox()).toEqual([])
	})
})

describe('accepting', () => {
	it('tells the captains when the player accepts their invitation', async () => {
		await createOffer(CAPTAIN, 'invitation')
		await answer(PLAYER, 'accepted')
		await clearOutbox()

		await fireTrigger('pending', 'accepted')

		expect(await sentTo()).toEqual([
			[CAPTAIN, 'teamInvitationAccepted'],
			[CO_CAPTAIN, 'teamInvitationAccepted'],
		])
		expect((await outbox())[0].props).toEqual({
			playerName: 'Alex Chen',
			teamName: 'Frost Giants',
		})
	})

	it('tells the player when a captain accepts their request', async () => {
		await createOffer(PLAYER, 'request')
		await answer(CAPTAIN, 'accepted')
		await clearOutbox()

		await fireTrigger('pending', 'accepted')

		expect(await sentTo()).toEqual([[PLAYER, 'teamRequestAccepted']])
		expect((await outbox())[0].props).toEqual({
			teamName: 'Frost Giants',
			seasonName: '2026 Fall',
		})
	})

	it('emails only once the player is really on the team', async () => {
		// updateOffer only marks the offer accepted; the trigger adds the
		// player. Until it has, nobody is told they joined.
		await createOffer(PLAYER, 'request')
		await clearOutbox()

		expect(await answer(CAPTAIN, 'accepted')).toBeNull()

		expect(await outbox()).toEqual([])
	})

	it('emails nobody when the player could not be added', async () => {
		// They joined another team first, so the trigger refuses the move.
		await createOffer(PLAYER, 'request')
		await answer(CAPTAIN, 'accepted')
		await putOnTeam(PLAYER, OTHER_TEAM, SEASON, false)
		await clearOutbox()

		await fireTrigger('pending', 'accepted')

		expect(
			(await firestore.collection('offers').doc(offerId()).get()).data()
				?.processingError
		).toMatch(/already on a team/)
		expect(await outbox()).toEqual([])
	})
})

describe('declining', () => {
	it('tells the captains when the player declines their invitation', async () => {
		await createOffer(CAPTAIN, 'invitation')
		await clearOutbox()

		expect(await answer(PLAYER, 'rejected')).toBeNull()

		expect(await sentTo()).toEqual([
			[CAPTAIN, 'teamInvitationDeclined'],
			[CO_CAPTAIN, 'teamInvitationDeclined'],
		])
	})

	it('tells the player when a captain declines their request', async () => {
		await createOffer(PLAYER, 'request')
		await clearOutbox()

		expect(await answer(CO_CAPTAIN, 'rejected')).toBeNull()

		expect(await sentTo()).toEqual([[PLAYER, 'teamRequestDeclined']])
	})

	it('emails nobody when declining is refused', async () => {
		// A teammate who is not a captain cannot answer a request.
		await createOffer(PLAYER, 'request')
		await clearOutbox()

		expect(await answer(TEAMMATE, 'rejected')).toBe('permission-denied')

		expect(await outbox()).toEqual([])
	})

	it('emails nobody when the trigger sees a declined offer', async () => {
		await createOffer(PLAYER, 'request')
		await answer(CAPTAIN, 'rejected')
		await clearOutbox()

		await fireTrigger('pending', 'rejected')

		expect(await outbox()).toEqual([])
	})
})

describe('canceling', () => {
	it.each([
		['a captain withdrawing an invitation', 'invitation', CAPTAIN],
		['a player withdrawing a request', 'request', PLAYER],
	] as const)('emails nobody for %s', async (_label, type, caller) => {
		await createOffer(type === 'invitation' ? CAPTAIN : PLAYER, type)
		await clearOutbox()

		expect(await answer(caller, 'canceled')).toBeNull()

		expect(await outbox()).toEqual([])
	})
})

describe('sending again after withdrawing', () => {
	/** Moves the offer's cancellation back in time. */
	const canceledAgo = (ms: number) =>
		firestore
			.collection('offers')
			.doc(offerId())
			.update({ respondedAt: Timestamp.fromMillis(Date.now() - ms) })

	const HOUR = 60 * 60 * 1000

	it('does not email the captains again when a request is withdrawn and re-sent', async () => {
		// Otherwise request, cancel, request would email them every time.
		await createOffer(PLAYER, 'request')
		await answer(PLAYER, 'canceled')
		await clearOutbox()

		expect(await createOffer(PLAYER, 'request')).toBeNull()

		expect(await outbox()).toEqual([])
		expect(
			(await firestore.collection('offers').doc(offerId()).get()).data()?.status
		).toBe('pending')
	})

	it('does not email the player again when an invitation is withdrawn and re-sent', async () => {
		await createOffer(CAPTAIN, 'invitation')
		await answer(CAPTAIN, 'canceled')
		await clearOutbox()

		expect(await createOffer(CO_CAPTAIN, 'invitation')).toBeNull()

		expect(await outbox()).toEqual([])
	})

	it('emails again once a day has passed since it was withdrawn', async () => {
		await createOffer(PLAYER, 'request')
		await answer(PLAYER, 'canceled')
		await canceledAgo(25 * HOUR)
		await clearOutbox()

		await createOffer(PLAYER, 'request')

		expect(await sentTo()).toEqual([
			[CAPTAIN, 'teamJoinRequest'],
			[CO_CAPTAIN, 'teamJoinRequest'],
		])
	})

	it('stays quiet until the day is up', async () => {
		await createOffer(PLAYER, 'request')
		await answer(PLAYER, 'canceled')
		await canceledAgo(23 * HOUR)
		await clearOutbox()

		await createOffer(PLAYER, 'request')

		expect(await outbox()).toEqual([])
	})

	it('emails again after a declined request, which the captains answered', async () => {
		// Declining is not withdrawing: asking again is a new question.
		await createOffer(PLAYER, 'request')
		await answer(CAPTAIN, 'rejected')
		await clearOutbox()

		await createOffer(PLAYER, 'request')

		expect(await sentTo()).toEqual([
			[CAPTAIN, 'teamJoinRequest'],
			[CO_CAPTAIN, 'teamJoinRequest'],
		])
	})
})

describe('what the player receives', () => {
	it('is a team email with the link to their team page and a way out', async () => {
		await createOffer(CAPTAIN, 'invitation')
		const [mail] = await outbox()
		const resend = fakeResend()

		expect(await deliverQueuedEmail(firestore, mail.id, resend)).toBe('sent')

		const { email } = resend.sent[0]
		expect(email.to).toBe(`${PLAYER}@example.com`)
		expect(email.subject).toBe('Sam Rivera invited you to join Frost Giants')
		expect(email.text).toContain('Hi Alex,')
		expect(email.text).toContain('https://mplswinterleague.com/manage')
		// Team email can be turned off, so it carries both unsubscribe routes.
		expect(email.headers['List-Unsubscribe']).toMatch(/c=teams/)
		expect(email.text).toMatch(/email-preferences\?.*c=teams/)
	})

	it('is not sent to a player who turned team email off', async () => {
		await firestore
			.collection('playerContacts')
			.doc(PLAYER)
			.set({ emailPreferences: { teams: false } }, { merge: true })
		await createOffer(CAPTAIN, 'invitation')
		const [mail] = await outbox()

		expect(await deliverQueuedEmail(firestore, mail.id, fakeResend())).toBe(
			'unsubscribed'
		)
	})
})
