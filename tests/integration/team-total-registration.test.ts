import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { initTestApp, resetFirestore } from './helpers.js'
import { TEAM_CONFIG } from '../../Functions/src/config/constants.js'
import { updateTeamRegistrationStatus } from '../../Functions/src/services/teamRegistrationService.js'
import {
	recordContribution,
	setContributionStatus,
} from '../../Functions/src/shared/contributions.js'
import { updateTeamRegistrationOnContributionChange } from '../../Functions/src/index.js'
import {
	playerSeasonRef,
	teamRosterEntryRef,
	teamSeasonRef,
} from '../../Functions/src/shared/database.js'

/**
 * Team-total registration: ten players who have signed their waiver, plus
 * $1,000 committed by any of them in any split.
 *
 * The two conditions are independent and need not be satisfied by the same
 * people. A captain who pays the whole $1,000 and has not signed does not
 * count toward the ten, and the team is still registered if ten others have
 * — their waiver decides whether *they* can play, not whether the team is in.
 *
 * The rule is selected by `teamRegistrationTotalCents` on the season. Seasons
 * without it keep the original per-player rule, covered in
 * team-registration-cap.test.ts.
 */

const MIN = TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION
const TOTAL = 100_000
const SEASON = 'season-1'
const TEAM = 'team-1'

let firestore: Firestore

const seasonRef = () => firestore.collection('seasons').doc(SEASON)
const teamRef = () => firestore.collection('teams').doc(TEAM)

const seedSeason = async (teamRegistrationTotalCents?: number) => {
	await seasonRef().set({
		name: '2030 Winter',
		dateStart: Timestamp.now(),
		registeredTeamCount: 0,
		...(teamRegistrationTotalCents === undefined
			? {}
			: { teamRegistrationTotalCents }),
	})
}

/** Adds a roster member with the given waiver and payment state. */
const seedPlayer = async (
	playerId: string,
	options: { signed?: boolean; paid?: boolean } = {}
) => {
	await firestore
		.collection('players')
		.doc(playerId)
		.set({ admin: false, banned: false, email: `${playerId}@example.com` })
	await teamRosterEntryRef(firestore, TEAM, SEASON, playerId).set({
		player: firestore.collection('players').doc(playerId),
		dateJoined: Timestamp.now(),
	})
	await playerSeasonRef(firestore, playerId, SEASON).set({
		season: seasonRef(),
		team: teamRef(),
		captain: false,
		paid: options.paid ?? false,
		signed: options.signed ?? false,
	})
}

const seedSignedRoster = async (count: number) => {
	for (let i = 0; i < count; i++) {
		await seedPlayer(`signed-${i}`, { signed: true })
	}
}

const contribute = (
	paymentIntentId: string,
	amountCents: number,
	playerId = 'signed-0',
	status: 'authorized' | 'captured' = 'authorized'
) =>
	recordContribution(firestore, {
		teamId: TEAM,
		seasonId: SEASON,
		playerId,
		paymentIntentId,
		amountCents,
		status,
	})

const isRegistered = async () =>
	(await teamSeasonRef(firestore, TEAM, SEASON).get()).data()?.registered

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seedSeason(TOTAL)
	await teamRef().set({ createdAt: Timestamp.now(), createdBy: null })
	await teamSeasonRef(firestore, TEAM, SEASON).set({
		season: seasonRef(),
		name: 'Test Team',
		registered: false,
		registeredDate: null,
		authorizedCents: 0,
		capturedCents: 0,
	})
})

describe('team-total registration', () => {
	it('registers on ten signed players and the full amount', async () => {
		await seedSignedRoster(MIN)
		await contribute('pi_1', TOTAL)

		await updateTeamRegistrationStatus(TEAM, SEASON)

		expect(await isRegistered()).toBe(true)
	})

	it('does not register on the money alone', async () => {
		await seedSignedRoster(MIN - 1)
		await contribute('pi_1', TOTAL)

		await updateTeamRegistrationStatus(TEAM, SEASON)

		expect(await isRegistered()).toBe(false)
	})

	it('does not register on the players alone', async () => {
		await seedSignedRoster(MIN)

		await updateTeamRegistrationStatus(TEAM, SEASON)

		expect(await isRegistered()).toBe(false)
	})

	it('does not register one dollar short', async () => {
		await seedSignedRoster(MIN)
		await contribute('pi_1', TOTAL - 100)

		await updateTeamRegistrationStatus(TEAM, SEASON)

		expect(await isRegistered()).toBe(false)
	})

	it.each([
		['one player paying it all', [100_000]],
		['ten paying $100 each', Array(10).fill(10_000)],
		['twenty paying $50 each', Array(20).fill(5_000)],
		['two paying $500 each', [50_000, 50_000]],
		['an uneven split', [70_000, 20_000, 10_000]],
	])('accepts %s', async (_label, amounts: number[]) => {
		// The point of the change: how the team divides it is their business.
		await seedSignedRoster(MIN)
		for (const [i, amount] of amounts.entries()) {
			await contribute(`pi_${i}`, amount)
		}

		await updateTeamRegistrationStatus(TEAM, SEASON)

		expect(await isRegistered()).toBe(true)
	})

	it('counts captured money as well as held money', async () => {
		// Capturing a hold must not make a funded team look unfunded.
		await seedSignedRoster(MIN)
		await contribute('pi_1', 60_000, 'signed-0', 'captured')
		await contribute('pi_2', 40_000, 'signed-1', 'authorized')

		await updateTeamRegistrationStatus(TEAM, SEASON)

		expect(await isRegistered()).toBe(true)
	})

	it.each(['canceled', 'refunded'] as const)(
		'does not count money that was %s',
		async (status) => {
			await seedSignedRoster(MIN)
			await contribute('pi_1', TOTAL)
			await setContributionStatus(firestore, {
				teamId: TEAM,
				seasonId: SEASON,
				paymentIntentId: 'pi_1',
				status,
			})

			await updateTeamRegistrationStatus(TEAM, SEASON)

			expect(await isRegistered()).toBe(false)
		}
	)

	it('falls back to the per-player rule when the total is null', async () => {
		// A field cleared to null rather than deleted must not read as a $0
		// team total, which every team would clear on signatures alone.
		await seasonRef().update({ teamRegistrationTotalCents: null })
		await seedSignedRoster(MIN)
		await contribute('pi_1', TOTAL)

		await updateTeamRegistrationStatus(TEAM, SEASON)

		// Per-player needs each of the ten paid as well as signed.
		expect(await isRegistered()).toBe(false)
	})

	it('registers when the payer has not signed but ten others have', async () => {
		// The two conditions are independent. The captain's own waiver decides
		// whether they can play, not whether the team is in.
		await seedSignedRoster(MIN)
		await seedPlayer('unsigned-captain', { signed: false })
		await contribute('pi_1', TOTAL, 'unsigned-captain')

		await updateTeamRegistrationStatus(TEAM, SEASON)

		expect(await isRegistered()).toBe(true)
	})

	it('does not count an unsigned player toward the ten', async () => {
		await seedSignedRoster(MIN - 1)
		await seedPlayer('unsigned', { signed: false, paid: true })
		await contribute('pi_1', TOTAL)

		await updateTeamRegistrationStatus(TEAM, SEASON)

		expect(await isRegistered()).toBe(false)
	})

	it('does not require any individual player to have paid', async () => {
		// Every player is `paid: false` — the money came from the team.
		await seedSignedRoster(MIN)
		await contribute('pi_1', TOTAL)

		await updateTeamRegistrationStatus(TEAM, SEASON)

		expect(await isRegistered()).toBe(true)
	})

	it('registers an overpaying team', async () => {
		await seedSignedRoster(MIN)
		await contribute('pi_1', 80_000)
		await contribute('pi_2', 20_000)
		await contribute('pi_3', 20_000)

		await updateTeamRegistrationStatus(TEAM, SEASON)

		expect(await isRegistered()).toBe(true)
	})

	it('honours a season that sets a different total', async () => {
		await seedSeason(50_000)
		await seedSignedRoster(MIN)
		await contribute('pi_1', 50_000)

		await updateTeamRegistrationStatus(TEAM, SEASON)

		expect(await isRegistered()).toBe(true)
	})
})

describe('a season without the flag keeps the old rule', () => {
	beforeEach(async () => {
		await seedSeason(undefined)
	})

	it('registers on ten paid and signed players, with no contributions', async () => {
		for (let i = 0; i < MIN; i++) {
			await seedPlayer(`old-${i}`, { signed: true, paid: true })
		}

		await updateTeamRegistrationStatus(TEAM, SEASON)

		expect(await isRegistered()).toBe(true)
	})

	it('does not register ten signed players who have not paid', async () => {
		// The distinction between the two rules, in one test.
		await seedSignedRoster(MIN)
		await contribute('pi_1', TOTAL)

		await updateTeamRegistrationStatus(TEAM, SEASON)

		expect(await isRegistered()).toBe(false)
	})
})

describe('money arriving last', () => {
	/**
	 * The common path under team-total pricing: the team signs its players
	 * in advance, then one person pays the moment registration opens. The
	 * money is the last condition to be met, so the change to the ledger has
	 * to be what registers the team. The waiver and roster triggers never
	 * fire at that point.
	 */
	const fireContribution = (
		before: Record<string, unknown> | undefined,
		after: Record<string, unknown> | undefined
	) =>
		updateTeamRegistrationOnContributionChange.run({
			params: { teamId: TEAM, seasonId: SEASON, paymentIntentId: 'pi_1' },
			data: {
				before: { exists: before !== undefined, data: () => before },
				after: { exists: after !== undefined, data: () => after },
			},
		} as never)

	it('registers the team when its contribution lands', async () => {
		await seedSignedRoster(MIN)
		await contribute('pi_1', TOTAL)
		expect(await isRegistered()).toBe(false)

		await fireContribution(undefined, {
			status: 'authorized',
			amountCents: TOTAL,
		})

		expect(await isRegistered()).toBe(true)
	})

	it('ignores a write that changes neither status nor amount', async () => {
		await seedSignedRoster(MIN)
		await contribute('pi_1', TOTAL)

		const same = { status: 'authorized', amountCents: TOTAL }
		await fireContribution(same, same)

		expect(await isRegistered()).toBe(false)
	})

	it('does not run while a migration is in progress', async () => {
		await firestore
			.collection('system')
			.doc('maintenance')
			.set({ migrationInProgress: true })
		await seedSignedRoster(MIN)
		await contribute('pi_1', TOTAL)

		await fireContribution(undefined, {
			status: 'authorized',
			amountCents: TOTAL,
		})

		expect(await isRegistered()).toBe(false)
	})
})
