import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { teamSeasonRef } from '../../Functions/src/shared/database.js'
import {
	authed,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	type Callable,
} from './helpers.js'

/**
 * Creating and editing seasons from the admin page.
 *
 * A season's team registration total is what puts it on team payments, so
 * it is validated here and cannot change while teams hold money against it:
 * settlement captures from the total, and a season without one is not
 * settled at all.
 */

const ADMIN = 'admin-1'
const SEASON = 'season-1'
const DAY_MS = 86_400_000

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const dates = {
	dateStart: new Date(Date.now() + 40 * DAY_MS).toISOString(),
	dateEnd: new Date(Date.now() + 90 * DAY_MS).toISOString(),
	registrationStart: new Date(Date.now() + 5 * DAY_MS).toISOString(),
	registrationEnd: new Date(Date.now() + 35 * DAY_MS).toISOString(),
}

const call = (name: string, data: Record<string, unknown>) =>
	(manifest[name] as Callable).run({ auth: authed(ADMIN), data } as never)
const codeOf = (name: string, data: Record<string, unknown>) =>
	errorCodeFrom(manifest[name] as Callable, { auth: authed(ADMIN), data })

const seasonData = async (id = SEASON) =>
	(await firestore.collection('seasons').doc(id).get()).data()

beforeAll(async () => {
	firestore = initTestApp()
	manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await firestore
		.collection('players')
		.doc(ADMIN)
		.set({ admin: true, banned: false, email: 'admin@example.com' })
	await firestore.collection('seasons').doc(SEASON).set({
		name: '2025 Fall',
		dateStart: Timestamp.now(),
		dateEnd: Timestamp.now(),
		registrationStart: Timestamp.now(),
		registrationEnd: Timestamp.now(),
		registeredTeamCount: 4,
	})
})

describe('updateSeason', () => {
	it('saves a traditional-format season', async () => {
		// The form sends no format for a traditional season.
		expect(
			await codeOf('updateSeason', {
				seasonId: SEASON,
				name: '2025 Fall',
				...dates,
			})
		).toBeNull()
		expect((await seasonData())?.format).toBeUndefined()
	})

	it('clears a swiss format when switched back to traditional', async () => {
		await call('updateSeason', {
			seasonId: SEASON,
			name: '2025 Fall',
			...dates,
			format: 'swiss',
		})
		expect((await seasonData())?.format).toBe('swiss')

		await call('updateSeason', {
			seasonId: SEASON,
			name: '2025 Fall',
			...dates,
		})
		expect((await seasonData())?.format).toBeUndefined()
	})

	it('leaves the count of claimed spots alone', async () => {
		await call('updateSeason', {
			seasonId: SEASON,
			name: '2025 Fall',
			...dates,
		})
		expect((await seasonData())?.registeredTeamCount).toBe(4)
	})
})

describe('createSeason pricing', () => {
	const create = (extra: Record<string, unknown> = {}) =>
		call('createSeason', { name: '2026 Fall', ...dates, ...extra }) as Promise<{
			seasonId: string
		}>

	it('creates a season on team payments', async () => {
		const { seasonId } = await create({ teamRegistrationTotalCents: 100_000 })
		expect(await seasonData(seasonId)).toMatchObject({
			teamRegistrationTotalCents: 100_000,
			registeredTeamCount: 0,
		})
	})

	it('creates a per-player season when no total is given', async () => {
		const { seasonId } = await create()
		const data = await seasonData(seasonId)
		expect(data).not.toHaveProperty('teamRegistrationTotalCents')
		expect(data?.registeredTeamCount).toBe(0)
	})

	it.each([
		['cents', 100_050],
		['zero', 0],
		['a negative total', -100_000],
		['more than $100,000', 10_000_100],
		['a string', '100000'],
	])('refuses %s', async (_label, total) => {
		expect(
			await codeOf('createSeason', {
				name: '2026 Fall',
				...dates,
				teamRegistrationTotalCents: total,
			})
		).toBe('invalid-argument')
		expect((await firestore.collection('seasons').get()).size).toBe(1)
	})
})

describe('updateSeason pricing', () => {
	const update = (extra: Record<string, unknown>) =>
		call('updateSeason', {
			seasonId: SEASON,
			name: '2025 Fall',
			...dates,
			...extra,
		})
	const updateCode = (extra: Record<string, unknown>) =>
		codeOf('updateSeason', {
			seasonId: SEASON,
			name: '2025 Fall',
			...dates,
			...extra,
		})

	const holdMoney = async (status: string) => {
		await firestore.collection('teams').doc('team-1').set({ teamId: 'team-1' })
		await teamSeasonRef(firestore, 'team-1', SEASON).set({
			season: firestore.collection('seasons').doc(SEASON),
			name: 'Team',
			registered: false,
		} as never)
		await teamSeasonRef(firestore, 'team-1', SEASON)
			.collection('contributions')
			.doc('pi_1')
			.set({ status, amountCents: 50_000 })
	}

	it('puts a season on team payments', async () => {
		await update({ teamRegistrationTotalCents: 100_000 })
		expect((await seasonData())?.teamRegistrationTotalCents).toBe(100_000)
	})

	it('leaves the total alone when the request does not mention it', async () => {
		// The form predates the field; saving the dates must not clear it.
		await update({ teamRegistrationTotalCents: 100_000 })
		await update({})
		expect((await seasonData())?.teamRegistrationTotalCents).toBe(100_000)
	})

	it('returns a season to per-player pricing on null', async () => {
		await update({ teamRegistrationTotalCents: 100_000 })
		await update({ teamRegistrationTotalCents: null })
		expect(await seasonData()).not.toHaveProperty('teamRegistrationTotalCents')
	})

	it('refuses an invalid total', async () => {
		expect(await updateCode({ teamRegistrationTotalCents: 99_950 })).toBe(
			'invalid-argument'
		)
	})

	it('refuses to change the total while a team holds money', async () => {
		await update({ teamRegistrationTotalCents: 100_000 })
		await holdMoney('paid')

		expect(await updateCode({ teamRegistrationTotalCents: 80_000 })).toBe(
			'failed-precondition'
		)
		expect(await updateCode({ teamRegistrationTotalCents: null })).toBe(
			'failed-precondition'
		)
		expect((await seasonData())?.teamRegistrationTotalCents).toBe(100_000)
	})

	it('still saves the rest of the season while money is held', async () => {
		// Resending the same total is not a change.
		await update({ teamRegistrationTotalCents: 100_000 })
		await holdMoney('paid')

		expect(
			await updateCode({ teamRegistrationTotalCents: 100_000, name: 'Renamed' })
		).toBeNull()
		expect((await seasonData())?.name).toBe('Renamed')
	})

	it('allows a change once every contribution is refunded', async () => {
		await update({ teamRegistrationTotalCents: 100_000 })
		await holdMoney('refunded')

		await update({ teamRegistrationTotalCents: 80_000 })
		expect((await seasonData())?.teamRegistrationTotalCents).toBe(80_000)
	})
})
