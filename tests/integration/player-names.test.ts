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
	createPlayer,
	updatePlayer,
	updatePlayerAdmin,
} from '../../Functions/src/index.js'

/**
 * Names reach Firestore through three callables, and until now each checked
 * only that it had a non-empty string. The App's `nameSchema` enforced the
 * real rules, but a callable is invocable by any authenticated user — so the
 * length cap, character set and normalization were not controls at all, and
 * names appear on rosters, the schedule and the public rankings.
 *
 * The rules themselves are unit-tested in `Functions/src/shared/names.test.ts`.
 * These tests are about the wiring: that every writer actually applies them,
 * and that nothing is written when one is rejected.
 */

const PLAYER = 'player-1'
const ADMIN = 'admin-uid'
const SEASON = 'season-1'

let firestore: Firestore

const playerRef = (playerId: string) =>
	firestore.collection('players').doc(playerId)

const readPlayer = async (playerId = PLAYER) =>
	(await playerRef(playerId).get()).data()

const seedPlayer = async (playerId: string, admin = false) => {
	await playerRef(playerId).set({
		admin,
		email: `${playerId}@example.com`,
		firstname: 'Existing',
		lastname: 'Name',
	})
}

/** A name that passes every rule but the one under test. */
const VALID = 'Kautz'

/** Rejected by the shared rules, in the order the validator checks them. */
const REJECTED: [string, string][] = [
	['too short', 'J'],
	['too long', 'a'.repeat(51)],
	['containing digits', 'Player1'],
	['containing symbols', 'Josh@Kautz'],
	['with consecutive hyphens', 'Josh--Kautz'],
	['that is only whitespace', '   '],
]

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await firestore
		.collection('seasons')
		.doc(SEASON)
		.set({
			name: '2030 Winter',
			dateStart: Timestamp.now(),
			registrationEnd: Timestamp.fromDate(new Date('2099-01-01')),
		})
})

describe('createPlayer', () => {
	const create = (data: Record<string, unknown>) =>
		createPlayer.run({
			auth: authed(PLAYER),
			data: {
				firstname: 'Josh',
				lastname: 'Kautz',
				email: `${PLAYER}@example.com`,
				...data,
			},
		} as unknown as CallableRequest<never>)

	const failsWith = (data: Record<string, unknown>) =>
		errorCodeFrom(createPlayer, {
			auth: authed(PLAYER),
			data: {
				firstname: 'Josh',
				lastname: 'Kautz',
				email: `${PLAYER}@example.com`,
				...data,
			},
		})

	it('normalizes the name it stores', async () => {
		await create({ firstname: '  josh  ', lastname: 'kautz' })

		expect(await readPlayer()).toMatchObject({
			firstname: 'Josh',
			lastname: 'Kautz',
		})
	})

	it('keeps the email off the public player document', async () => {
		// Anyone can read players/{uid}; only the player and admins can read
		// playerContacts/{uid}.
		await create({})

		expect(await readPlayer()).not.toHaveProperty('email')
		const contact = await firestore
			.collection('playerContacts')
			.doc(PLAYER)
			.get()
		expect(contact.data()).toEqual({ email: `${PLAYER}@example.com` })
	})

	it('creates no contact when the name is rejected', async () => {
		await failsWith({ firstname: 'Josh1' })

		const contact = await firestore
			.collection('playerContacts')
			.doc(PLAYER)
			.get()
		expect(contact.exists).toBe(false)
	})

	it.each(REJECTED)('rejects a first name %s', async (_label, firstname) => {
		expect(await failsWith({ firstname })).toBe('invalid-argument')
	})

	it.each(REJECTED)('rejects a last name %s', async (_label, lastname) => {
		expect(await failsWith({ lastname })).toBe('invalid-argument')
	})

	it('creates no player when the name is rejected', async () => {
		// The player document is created alongside a season subdoc per open
		// season, so a partial create would leave registration state behind.
		await failsWith({ firstname: 'Josh1' })

		expect(await readPlayer()).toBeUndefined()
	})

	it('rejects a non-string name rather than coercing it', async () => {
		expect(await failsWith({ firstname: 42 })).toBe('invalid-argument')
	})

	it('rejects an obscenity', async () => {
		expect(await failsWith({ lastname: 'Shit' })).toBe('invalid-argument')
	})

	it('accepts a real surname the blocklist ships with', async () => {
		await create({ firstname: 'Josh', lastname: 'Cox' })

		expect((await readPlayer())?.lastname).toBe('Cox')
	})
})

describe('updatePlayer', () => {
	const failsWith = (data: Record<string, unknown>) =>
		errorCodeFrom(updatePlayer, { auth: authed(PLAYER), data })

	beforeEach(async () => {
		await seedPlayer(PLAYER)
	})

	it('normalizes the name it stores', async () => {
		await updatePlayer.run({
			auth: authed(PLAYER),
			data: { firstname: 'josh   michael' },
		} as unknown as CallableRequest<never>)

		expect((await readPlayer())?.firstname).toBe('Josh Michael')
	})

	it.each(REJECTED)('rejects a first name %s', async (_label, firstname) => {
		expect(await failsWith({ firstname })).toBe('invalid-argument')
	})

	it('leaves the existing name when an update is rejected', async () => {
		await failsWith({ firstname: 'a'.repeat(51) })

		expect((await readPlayer())?.firstname).toBe('Existing')
	})

	it('rejects an obscenity', async () => {
		expect(await failsWith({ lastname: 'Shit' })).toBe('invalid-argument')
	})

	it('accepts a real surname the blocklist ships with', async () => {
		await updatePlayer.run({
			auth: authed(PLAYER),
			data: { lastname: 'Wang' },
		} as unknown as CallableRequest<never>)

		expect((await readPlayer())?.lastname).toBe('Wang')
	})

	it('still allows updating one name on its own', async () => {
		await updatePlayer.run({
			auth: authed(PLAYER),
			data: { lastname: VALID },
		} as unknown as CallableRequest<never>)
		const player = await readPlayer()

		expect(player?.lastname).toBe(VALID)
		expect(player?.firstname).toBe('Existing')
	})
})

describe('updatePlayerAdmin', () => {
	const failsWith = (data: Record<string, unknown>) =>
		errorCodeFrom(updatePlayerAdmin, { auth: authed(ADMIN), data })

	beforeEach(async () => {
		await seedPlayer(ADMIN, true)
		await seedPlayer(PLAYER)
	})

	it('normalizes the name it stores', async () => {
		await updatePlayerAdmin.run({
			auth: authed(ADMIN),
			data: { playerId: PLAYER, firstname: 'josh' },
		} as unknown as CallableRequest<never>)

		expect((await readPlayer())?.firstname).toBe('Josh')
	})

	it.each(REJECTED)('rejects a first name %s', async (_label, firstname) => {
		expect(await failsWith({ playerId: PLAYER, firstname })).toBe(
			'invalid-argument'
		)
	})

	it('leaves the existing name when an update is rejected', async () => {
		await failsWith({ playerId: PLAYER, firstname: 'Josh--Kautz' })

		expect((await readPlayer())?.firstname).toBe('Existing')
	})

	it('lets an admin set a name the profanity filter refuses', async () => {
		// The escape hatch for a real person the blocklist cannot know about.
		// An organizer typing the name deliberately is the override.
		await updatePlayerAdmin.run({
			auth: authed(ADMIN),
			data: { playerId: PLAYER, lastname: 'Shit' },
		} as unknown as CallableRequest<never>)

		expect((await readPlayer())?.lastname).toBe('Shit')
	})

	it('still applies the structural rules to an admin edit', async () => {
		expect(
			await failsWith({ playerId: PLAYER, lastname: 'a'.repeat(51) })
		).toBe('invalid-argument')
	})

	it('reports the normalized value as the change it made', async () => {
		// The response drives the admin screen's confirmation toast, so it
		// has to say what was stored rather than what was typed.
		const result = (await updatePlayerAdmin.run({
			auth: authed(ADMIN),
			data: { playerId: PLAYER, firstname: 'josh' },
		} as unknown as CallableRequest<never>)) as {
			changes: { firstname?: { to: string } }
		}

		expect(result.changes.firstname?.to).toBe('Josh')
	})
})
