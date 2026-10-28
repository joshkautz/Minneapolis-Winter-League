import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import { updateTeamRegistrationStatus } from '../../Functions/src/services/teamRegistration.js'
import {
	heldSpotTeamsFor,
	releaseHeldSpots,
} from '../../Functions/src/services/heldSpots.js'
import { settleTeamSeason } from '../../Functions/src/services/teamSettlement.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'
import { teamContributionsCollection } from '../../Functions/src/shared/contributions.js'
import {
	HELD_SPOT_DAYS,
	MIN_SIGNED_PLAYERS,
	REGISTRATION_SPOTS,
} from '../../Functions/src/shared/teamPaymentRules.js'
import { fakeStripe, resetFakeStripe } from './fake-stripe.js'

vi.mock('stripe', async () => ({
	default: (await import('./fake-stripe.js')).FakeStripe,
}))

/**
 * Something to do just before each registration attempt, so a test can
 * make a team start waiting in the middle of a release.
 */
const hooks = vi.hoisted(() => ({
	beforeClaim: null as null | ((teamId: string) => Promise<void>),
}))

vi.mock(
	'../../Functions/src/services/teamRegistration.js',
	async (importOriginal) => {
		const original =
			await importOriginal<
				typeof import('../../Functions/src/services/teamRegistration.js')
			>()
		return {
			...original,
			updateTeamRegistrationStatus: async (
				...args: Parameters<typeof original.updateTeamRegistrationStatus>
			) => {
				await hooks.beforeClaim?.(args[0])
				return original.updateTeamRegistrationStatus(...args)
			},
		}
	}
)

/**
 * Held spots: last season's top three have a week from registration opening
 * in which nobody else can take their spots. A team that qualifies when only
 * held spots are left waits, money kept, and when the holds end the waiting
 * teams get whatever the held teams left, in the order they qualified.
 */

const MIN = MIN_SIGNED_PLAYERS
const CAP = REGISTRATION_SPOTS
const SEASON = 'season-6'
const HELD = ['champion', 'runner-up', 'third']
const DAY_MS = 24 * 60 * 60 * 1000

const OPENS = new Date('2030-10-01T17:00:00Z')
/** When the holds end: a week after registration opens. */
const HOLDS_END = new Date(OPENS.getTime() + HELD_SPOT_DAYS * DAY_MS)
const DURING_HOLDS = new Date(OPENS.getTime() + DAY_MS)

let firestore: Firestore

const seasonRef = (seasonId = SEASON) =>
	firestore.collection('seasons').doc(seasonId)

/** The season, with `fields` laid over it; an undefined field is left out. */
const seedSeason = (fields: Record<string, unknown> = {}) =>
	seasonRef().set(
		Object.fromEntries(
			Object.entries({
				name: 'Season 6',
				dateStart: Timestamp.fromDate(new Date('2030-11-01T00:00:00Z')),
				registrationStart: Timestamp.fromDate(OPENS),
				registrationEnd: Timestamp.fromDate(new Date('2030-10-31T05:00:00Z')),
				registeredTeamCount: 0,
				heldSpotTeamIds: HELD,
				...fields,
			}).filter(([, value]) => value !== undefined)
		)
	)

const seedTeam = async (teamId: string, seasonId = SEASON) => {
	await firestore
		.collection('teams')
		.doc(teamId)
		.set({ createdAt: Timestamp.now(), createdBy: null })
	await teamSeasonRef(firestore, teamId, seasonId).set({
		season: seasonRef(seasonId),
		name: teamId,
		logo: null,
		storagePath: null,
		registered: false,
		registeredDate: null,
		placement: null,
	})
}

/** Puts ten paid and signed players on a team's roster. */
const seedQualifyingRoster = async (teamId: string) => {
	for (let i = 0; i < MIN; i++) {
		const playerId = `${teamId}-player-${i}`
		await firestore
			.collection('players')
			.doc(playerId)
			.set({ admin: false, banned: false })
		await teamRosterEntryRef(firestore, teamId, SEASON, playerId).set({
			player: firestore.collection('players').doc(playerId),
			dateJoined: Timestamp.now(),
		})
		await playerSeasonRef(firestore, playerId, SEASON).set({
			season: seasonRef(),
			team: firestore.collection('teams').doc(teamId),
			paid: true,
			signed: true,
			captain: i === 0,
		})
	}
}

const seedQualifyingTeam = async (teamId: string) => {
	await seedTeam(teamId)
	await seedQualifyingRoster(teamId)
}

const register = (
	teamId: string,
	now = DURING_HOLDS,
	trigger: 'payment' | 'other' = 'other'
) => updateTeamRegistrationStatus(teamId, SEASON, { now, trigger })

const teamSeason = async (teamId: string) =>
	(await teamSeasonRef(firestore, teamId, SEASON).get()).data()

const season = async () => (await seasonRef().get()).data()

/** Registers `count` teams that are not held, leaving the rest open. */
const fillOpenSpots = async (count: number) => {
	for (let i = 0; i < count; i++) {
		await seedQualifyingTeam(`filler-${i}`)
		await register(`filler-${i}`)
	}
}

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	hooks.beforeClaim = null
	resetFakeStripe()
	await resetFirestore(firestore)
	await seedSeason()
})

describe('the teams a season holds spots for', () => {
	const placeIn = async (
		seasonId: string,
		dateStart: string,
		placements: Record<string, number | null>
	) => {
		await seasonRef(seasonId).set({
			name: seasonId,
			dateStart: Timestamp.fromDate(new Date(dateStart)),
		})
		for (const [teamId, placement] of Object.entries(placements)) {
			await seedTeam(teamId, seasonId)
			await teamSeasonRef(firestore, teamId, seasonId).update({ placement })
		}
	}

	it('are the previous season’s top three, best first', async () => {
		await placeIn('season-4', '2029-11-01T00:00:00Z', {
			'old-champion': 1,
		})
		await placeIn('season-5', '2030-01-01T00:00:00Z', {
			bronze: 3,
			gold: 1,
			fourth: 4,
			silver: 2,
			unplaced: null,
		})

		expect(
			await heldSpotTeamsFor(
				firestore,
				Timestamp.fromDate(new Date('2030-11-01T00:00:00Z'))
			)
		).toEqual({
			teamIds: ['gold', 'silver', 'bronze'],
			previousSeason: { id: 'season-5', name: 'season-5' },
		})
	})

	it('are none for the first season', async () => {
		expect(
			await heldSpotTeamsFor(
				firestore,
				Timestamp.fromDate(new Date('2020-01-01T00:00:00Z'))
			)
		).toEqual({ teamIds: [], previousSeason: null })
	})
})

describe('registering while spots are held', () => {
	it('keeps the held spots from a team that is not held', async () => {
		await fillOpenSpots(CAP - HELD.length)
		await seedQualifyingTeam('latecomer')

		const result = await register('latecomer')

		expect(result.outcome).toBe('waiting-for-held-spot')
		expect((await teamSeason('latecomer'))?.registered).toBe(false)
		expect((await teamSeason('latecomer'))?.waitingForSpotSince).toBeTruthy()
		expect((await season())?.registeredTeamCount).toBe(CAP - HELD.length)
	})

	it('lets a team that is not held take an open spot', async () => {
		await fillOpenSpots(CAP - HELD.length - 1)
		await seedQualifyingTeam('in-time')

		await register('in-time')

		expect((await teamSeason('in-time'))?.registered).toBe(true)
		expect((await teamSeason('in-time'))?.waitingForSpotSince).toBeUndefined()
	})

	it('always has room for a held team', async () => {
		await fillOpenSpots(CAP - HELD.length)
		for (const teamId of HELD) await seedQualifyingTeam(teamId)

		for (const teamId of HELD) await register(teamId)

		for (const teamId of HELD) {
			expect((await teamSeason(teamId))?.registered).toBe(true)
		}
		expect((await season())?.registeredTeamCount).toBe(CAP)
	})

	it('does not count a held team that has registered as holding a spot', async () => {
		await seedQualifyingTeam('champion')
		await register('champion')
		// Eleven taken, two still held.
		await fillOpenSpots(CAP - HELD.length)

		await seedQualifyingTeam('latecomer')
		expect((await register('latecomer')).outcome).toBe('waiting-for-held-spot')
		expect((await season())?.registeredTeamCount).toBe(CAP - 2)
	})

	it('keeps a waiting team’s place as when it first qualified', async () => {
		await fillOpenSpots(CAP - HELD.length)
		await seedQualifyingTeam('latecomer')
		await register('latecomer')
		const since = (await teamSeason('latecomer'))?.waitingForSpotSince

		await register('latecomer')

		expect((await teamSeason('latecomer'))?.waitingForSpotSince).toEqual(since)
	})

	it('takes a team out of the queue when it stops qualifying', async () => {
		await fillOpenSpots(CAP - HELD.length)
		await seedQualifyingTeam('wavering')
		await register('wavering')
		await seedQualifyingTeam('steady')
		await register('steady')

		// A player's waiver is withdrawn, then signed again.
		const player = playerSeasonRef(firestore, 'wavering-player-0', SEASON)
		await player.update({ signed: false })
		expect((await register('wavering')).outcome).toBe('not-qualified')
		expect((await teamSeason('wavering'))?.waitingForSpotSince).toBeNull()
		await player.update({ signed: true })
		await register('wavering')

		// It waits again, from now: behind the team that never stopped.
		const since = async (teamId: string) =>
			(await teamSeason(teamId))?.waitingForSpotSince.toMillis()
		expect(await since('wavering')).toBeGreaterThan(await since('steady'))
	})

	it('holds nothing for a season without held spots', async () => {
		await seedSeason({ heldSpotTeamIds: undefined })
		await fillOpenSpots(CAP - 1)
		await seedQualifyingTeam('last')

		await register('last')

		expect((await teamSeason('last'))?.registered).toBe(true)
	})
})

describe('releasing held spots', () => {
	/**
	 * Three teams waiting, with one held team in. They qualify in an order
	 * that is not their ids', which is the order a query returns them in.
	 */
	const seedQueue = async () => {
		await fillOpenSpots(CAP - HELD.length)
		await seedQualifyingTeam('champion')
		await register('champion')
		for (const teamId of ['waiting-z', 'waiting-a', 'waiting-m']) {
			await seedQualifyingTeam(teamId)
			await register(teamId)
		}
	}

	it('does nothing before the week is up', async () => {
		await seedQueue()

		const result = await releaseHeldSpots(
			firestore,
			new Date(HOLDS_END.getTime() - 1)
		)

		expect(result.seasonsReleased).toEqual([])
		expect((await season())?.heldSpotsReleasedAt).toBeUndefined()
		expect((await teamSeason('waiting-a'))?.registered).toBe(false)
	})

	it('gives the unclaimed spots to waiting teams in the order they qualified', async () => {
		await seedQueue()

		const result = await releaseHeldSpots(firestore, HOLDS_END)

		expect(result).toEqual({ seasonsReleased: [SEASON], failures: [] })
		// Two held teams never registered, so two spots open.
		expect((await teamSeason('waiting-z'))?.registered).toBe(true)
		expect((await teamSeason('waiting-a'))?.registered).toBe(true)
		expect((await teamSeason('waiting-m'))?.registered).toBe(false)
		expect((await season())?.registeredTeamCount).toBe(CAP)
		expect((await season())?.heldSpotsReleasedAt).toBeTruthy()
	})

	it('makes a team that qualifies after the week, before the release, wait its turn', async () => {
		await fillOpenSpots(CAP - HELD.length)
		await seedQualifyingTeam('patient')
		await register('patient')
		// Two of the three held spots are claimed, so only one will open.
		for (const teamId of ['champion', 'runner-up']) {
			await seedQualifyingTeam(teamId)
			await register(teamId)
		}

		// The week is up but the sweep has not run yet.
		await seedQualifyingTeam('eager')
		const eager = await register('eager', HOLDS_END)
		expect(eager.outcome).toBe('waiting-for-held-spot')

		await releaseHeldSpots(firestore, HOLDS_END)

		expect((await teamSeason('patient'))?.registered).toBe(true)
		expect((await teamSeason('eager'))?.registered).toBe(false)
	})

	it('gives a team that starts waiting during the release its turn', async () => {
		await fillOpenSpots(CAP - HELD.length)
		await seedQualifyingTeam('first')
		await register('first')
		await seedQualifyingTeam('midway')
		// It qualifies while the release is giving 'first' its turn, after the
		// release has looked for waiting teams.
		hooks.beforeClaim = async (teamId) => {
			if (teamId !== 'first') return
			hooks.beforeClaim = null
			await register('midway', HOLDS_END)
		}

		await releaseHeldSpots(firestore, HOLDS_END)

		expect((await teamSeason('first'))?.registered).toBe(true)
		expect((await teamSeason('midway'))?.registered).toBe(true)
	})

	it('releases each season on its own', async () => {
		// One season's data is broken; the other's holds are still released.
		await seasonRef('broken').set({
			name: 'Broken',
			dateStart: Timestamp.now(),
			heldSpotTeamIds: HELD,
		})
		await seedQueue()

		const result = await releaseHeldSpots(firestore, HOLDS_END)

		expect(result.seasonsReleased).toEqual([SEASON])
		expect(result.failures).toEqual([
			expect.objectContaining({ seasonId: 'broken' }),
		])
	})

	it('releases only once', async () => {
		await seedQueue()
		await releaseHeldSpots(firestore, HOLDS_END)
		const releasedAt = (await season())?.heldSpotsReleasedAt

		const again = await releaseHeldSpots(firestore, HOLDS_END)

		expect(again.seasonsReleased).toEqual([])
		expect((await season())?.heldSpotsReleasedAt).toEqual(releasedAt)
	})

	it('treats every team alike once the holds are released', async () => {
		await fillOpenSpots(CAP - HELD.length)
		await releaseHeldSpots(firestore, HOLDS_END)

		await seedQualifyingTeam('anyone')
		await register('anyone', HOLDS_END)

		expect((await teamSeason('anyone'))?.registered).toBe(true)
	})
})

describe('a waiting team under team payments', () => {
	const TOTAL = 100_000
	const CLOSES = new Date(OPENS.getTime() + 3 * DAY_MS)

	/** A team-payment season whose registration closes before the week is up. */
	const seedShortSeason = () =>
		seedSeason({
			teamRegistrationTotalCents: TOTAL,
			registrationEnd: Timestamp.fromDate(CLOSES),
		})

	const payInFull = (teamId: string) =>
		teamContributionsCollection(firestore, teamId, SEASON)
			.doc(`pi_${teamId}`)
			.set({
				player: firestore.collection('players').doc(`${teamId}-player-0`),
				status: 'paid',
				amountCents: TOTAL,
				createdAt: Timestamp.now(),
			})

	const seedPaidTeam = async (teamId: string) => {
		await seedQualifyingTeam(teamId)
		await payInFull(teamId)
	}

	beforeEach(async () => {
		await seedShortSeason()
		for (let i = 0; i < CAP - HELD.length; i++) {
			await seedPaidTeam(`filler-${i}`)
			await register(`filler-${i}`)
		}
		await seedPaidTeam('waiting')
		await register('waiting')
	})

	it('keeps its money after registration closes, while it waits', async () => {
		const afterClose = new Date(CLOSES.getTime() + DAY_MS)

		const outcome = await settleTeamSeason('waiting', SEASON, {
			now: afterClose,
		})

		expect(outcome).toMatchObject({ disposition: 'pending' })
		expect(fakeStripe.calls).toEqual([])
	})

	it('is registered when the holds end with registration closed', async () => {
		// The holds end with registration, and the sweep runs after it.
		const afterClose = new Date(CLOSES.getTime() + DAY_MS)

		await releaseHeldSpots(firestore, afterClose)

		expect((await teamSeason('waiting'))?.registered).toBe(true)
	})

	it('cannot register late without having waited', async () => {
		const afterClose = new Date(CLOSES.getTime() + DAY_MS)
		await releaseHeldSpots(firestore, afterClose)

		await seedPaidTeam('too-late')
		const result = await register('too-late', afterClose)

		expect(result.outcome).toBe('registration-closed')
	})
})

describe('a team completed by a late payment while spots are held', () => {
	// On the real clock, since a team's place in the queue is the server's
	// time: registration closed a minute ago, and a checkout opened before
	// the close can still complete a team in the grace that follows.
	const realNow = Date.now()
	const CLOSED = new Date(realNow - 60_000)

	it('waits, and is registered when the holds end', async () => {
		await seedSeason({
			teamRegistrationTotalCents: 100_000,
			registrationStart: Timestamp.fromMillis(realNow - 2 * DAY_MS),
			registrationEnd: Timestamp.fromDate(CLOSED),
		})
		const whileOpen = new Date(realNow - DAY_MS)
		for (let i = 0; i < CAP - HELD.length; i++) {
			await seedQualifyingTeam(`filler-${i}`)
			await teamContributionsCollection(firestore, `filler-${i}`, SEASON)
				.doc(`pi_filler-${i}`)
				.set({
					player: firestore.collection('players').doc(`filler-${i}-player-0`),
					status: 'paid',
					amountCents: 100_000,
					createdAt: Timestamp.now(),
				})
			await register(`filler-${i}`, whileOpen)
		}
		await seedQualifyingTeam('just-in-time')
		await teamContributionsCollection(firestore, 'just-in-time', SEASON)
			.doc('pi_late')
			.set({
				player: firestore.collection('players').doc('just-in-time-player-0'),
				status: 'paid',
				amountCents: 100_000,
				createdAt: Timestamp.now(),
			})

		expect(
			(await register('just-in-time', new Date(), 'payment')).outcome
		).toBe('waiting-for-held-spot')

		await releaseHeldSpots(firestore, new Date(realNow + DAY_MS))

		expect((await teamSeason('just-in-time'))?.registered).toBe(true)
	})
})
