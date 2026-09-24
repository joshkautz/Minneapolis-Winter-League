import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { CallableRequest } from 'firebase-functions/v2/https'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
	authed,
	type Callable,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	seedAuthUser,
} from './helpers.js'
import { playerSeasonRef } from '../../Functions/src/shared/database.js'
import { waiverFingerprint } from '../../Functions/src/waiver/fingerprint.js'
import {
	CURRENT_WAIVER_VERSION_ID,
	currentWaiverVersion,
} from '../../Functions/src/waiver/versions.js'

/**
 * Signing the waiver in the app, which replaced Dropbox Sign.
 *
 * `signed` on the player-season is what registration counts, so the thing to
 * get right is that it becomes true exactly when a valid signature is on
 * record, once, for the right person — and that the record holds what would
 * be needed to show a court who agreed to which text.
 */

const SEASON = 'season-1'
const PLAYER = 'player-1'
const DAY_MS = 24 * 60 * 60 * 1000

let firestore: Firestore
let signWaiver: Callable

const adultSubmission = (overrides: Record<string, unknown> = {}) => ({
	versionId: CURRENT_WAIVER_VERSION_ID,
	dateOfBirth: '1990-05-17',
	mailingAddress: '123 Main St, Minneapolis, MN 55401',
	emergencyContacts: [
		{ name: 'Sam Doe', relationship: 'Partner', phone: '(612) 555-0100' },
	],
	signerName: 'Test Player',
	agreed: true,
	...overrides,
})

/** A player born 12 years before today, whatever today is. */
const childDateOfBirth = (): string => {
	const date = new Date()
	date.setFullYear(date.getFullYear() - 12)
	return date.toISOString().slice(0, 10)
}

const sign = async (
	data: unknown,
	options: { uid?: string; headers?: Record<string, string> } = {}
): Promise<unknown> =>
	await signWaiver.run({
		auth: authed(options.uid ?? PLAYER),
		data,
		rawRequest: {
			ip: '10.0.0.1',
			headers: {
				'user-agent': 'Vitest Browser',
				...options.headers,
			},
		},
	} as unknown as CallableRequest<never>)

const failure = async (
	data: unknown
): Promise<{ code: string; message: string }> => {
	try {
		await sign(data)
	} catch (error) {
		return error as { code: string; message: string }
	}
	throw new Error('expected signing to fail')
}

const readSignatures = async (playerId = PLAYER) =>
	(
		await firestore
			.collection('players')
			.doc(playerId)
			.collection('waiverSignatures')
			.get()
	).docs.map((doc) => doc.data())

const isSigned = async (playerId = PLAYER): Promise<boolean | undefined> =>
	(await playerSeasonRef(firestore, playerId, SEASON).get()).data()?.signed

const seedSeason = (overrides: Record<string, unknown> = {}) =>
	firestore
		.collection('seasons')
		.doc(SEASON)
		.set({
			name: '2030 Fall',
			dateStart: Timestamp.fromMillis(Date.now() + 30 * DAY_MS),
			dateEnd: Timestamp.fromMillis(Date.now() + 90 * DAY_MS),
			registrationStart: Timestamp.fromMillis(Date.now() + 5 * DAY_MS),
			registrationEnd: Timestamp.fromMillis(Date.now() + 20 * DAY_MS),
			...overrides,
		})

const seedPlayer = async (
	uid: string,
	overrides: Record<string, unknown> = {}
) => {
	await seedAuthUser(uid, true)
	await firestore
		.collection('players')
		.doc(uid)
		.set({
			admin: false,
			banned: false,
			email: `${uid}@example.com`,
			firstname: 'Test',
			lastname: 'Player',
			...overrides,
		})
	await playerSeasonRef(firestore, uid, SEASON).set({
		season: firestore.collection('seasons').doc(SEASON),
		team: null,
		paid: false,
		signed: false,
		captain: false,
	})
}

beforeAll(async () => {
	firestore = initTestApp()
	const manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
	signWaiver = manifest.signWaiver as Callable
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await seedSeason()
	await seedPlayer(PLAYER)
})

describe('signWaiver', () => {
	it('records the signature and marks the player signed', async () => {
		await expect(sign(adultSubmission())).resolves.toEqual({
			success: true,
			alreadySigned: false,
			seasonId: SEASON,
		})

		expect(await isSigned()).toBe(true)
		const [record] = await readSignatures()
		expect(record).toMatchObject({
			seasonId: SEASON,
			versionId: CURRENT_WAIVER_VERSION_ID,
			versionSha256: waiverFingerprint(currentWaiverVersion()),
			method: 'player',
			recordedBy: PLAYER,
			participantName: 'Test Player',
			signerName: 'Test Player',
			signerRole: 'participant',
			guardianRelationship: null,
			dateOfBirth: '1990-05-17',
			mailingAddress: '123 Main St, Minneapolis, MN 55401',
			emergencyContacts: [
				{ name: 'Sam Doe', relationship: 'Partner', phone: '(612) 555-0100' },
			],
			email: `${PLAYER}@example.com`,
			userAgent: 'Vitest Browser',
			note: null,
		})
		expect(record.signedAt).toBeInstanceOf(Timestamp)
	})

	it('records where the request came from, preferring the forwarded client', async () => {
		await sign(adultSubmission(), {
			headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.2' },
		})

		expect((await readSignatures())[0].ipAddress).toBe('203.0.113.9')
	})

	it('lets a player sign before joining a team', async () => {
		// Nobody is on a roster here; signing early is the point.
		await sign(adultSubmission())

		expect(await isSigned()).toBe(true)
	})

	it('lets a player sign before registration opens', async () => {
		// The seeded season's registration opens in five days.
		await sign(adultSubmission())

		expect(await isSigned()).toBe(true)
	})

	it('signs once, however many times it is asked', async () => {
		await sign(adultSubmission())

		await expect(sign(adultSubmission())).resolves.toMatchObject({
			alreadySigned: true,
		})
		expect(await readSignatures()).toHaveLength(1)
	})

	it('records one signature when two requests race', async () => {
		// A double tap, or the page open in two tabs.
		const results = (await Promise.all([
			sign(adultSubmission()),
			sign(adultSubmission()),
		])) as { alreadySigned: boolean }[]

		expect(results.map((r) => r.alreadySigned).sort()).toEqual([false, true])
		expect(await readSignatures()).toHaveLength(1)
	})

	it('creates the player-season if it is missing', async () => {
		await playerSeasonRef(firestore, PLAYER, SEASON).delete()

		await sign(adultSubmission())

		expect(
			(await playerSeasonRef(firestore, PLAYER, SEASON).get()).data()
		).toMatchObject({ signed: true, team: null, paid: false, captain: false })
	})

	it('refuses an adult who types a name other than their own', async () => {
		const error = await failure(adultSubmission({ signerName: 'Someone Else' }))

		expect(error.code).toBe('invalid-argument')
		expect(error.message).toMatch(/as it appears on your profile/)
		expect(await isSigned()).toBe(false)
		expect(await readSignatures()).toHaveLength(0)
	})

	it('refuses without the box checked', async () => {
		const error = await failure(adultSubmission({ agreed: false }))

		expect(error.code).toBe('invalid-argument')
		expect(await isSigned()).toBe(false)
	})

	it('treats a non-boolean agreement as not agreed', async () => {
		expect((await failure(adultSubmission({ agreed: 'yes' }))).code).toBe(
			'invalid-argument'
		)
	})

	it('refuses a stale version of the waiver', async () => {
		const error = await failure(adultSubmission({ versionId: 'old-text' }))

		expect(error.code).toBe('failed-precondition')
		expect(error.message).toMatch(/Reload the page/)
		expect(await isSigned()).toBe(false)
	})

	it('refuses a malformed payload without writing anything', async () => {
		expect(
			(
				await failure({
					versionId: CURRENT_WAIVER_VERSION_ID,
					emergencyContacts: 'not a list',
				})
			).code
		).toBe('invalid-argument')
		expect(await readSignatures()).toHaveLength(0)
	})

	it('refuses a banned player', async () => {
		await firestore.collection('players').doc(PLAYER).update({ banned: true })

		expect(
			await errorCodeFrom(signWaiver, {
				auth: authed(PLAYER),
				data: adultSubmission(),
			})
		).toBe('permission-denied')
		expect(await isSigned()).toBe(false)
	})

	it('refuses once the season has ended', async () => {
		await seedSeason({
			dateEnd: Timestamp.fromMillis(Date.now() - DAY_MS),
		})

		const error = await failure(adultSubmission())

		expect(error.code).toBe('failed-precondition')
		expect(error.message).toMatch(/has ended/)
	})

	it('signs for the newest season, not an older one', async () => {
		await firestore
			.collection('seasons')
			.doc('season-old')
			.set({
				name: '2029 Fall',
				dateStart: Timestamp.fromMillis(Date.now() - 365 * DAY_MS),
				dateEnd: Timestamp.fromMillis(Date.now() - 300 * DAY_MS),
			})

		await expect(sign(adultSubmission())).resolves.toMatchObject({
			seasonId: SEASON,
		})
	})

	describe('for a player under 18', () => {
		const minorSubmission = (overrides: Record<string, unknown> = {}) =>
			adultSubmission({
				dateOfBirth: childDateOfBirth(),
				signerName: 'Pat Player',
				guardianRelationship: 'Mother',
				...overrides,
			})

		it('records the parent or guardian as the signer', async () => {
			await sign(minorSubmission())

			expect(await isSigned()).toBe(true)
			expect((await readSignatures())[0]).toMatchObject({
				participantName: 'Test Player',
				signerName: 'Pat Player',
				signerRole: 'guardian',
				guardianRelationship: 'Mother',
			})
		})

		it('requires the relationship', async () => {
			const error = await failure(minorSubmission({ guardianRelationship: '' }))

			expect(error.code).toBe('invalid-argument')
			expect(await isSigned()).toBe(false)
		})

		it('refuses the player signing for themselves', async () => {
			const error = await failure(
				minorSubmission({ signerName: 'Test Player' })
			)

			expect(error.message).toMatch(/parent or guardian must sign/)
			expect(await isSigned()).toBe(false)
		})
	})

	it("writes only under the caller's own player", async () => {
		// There is no player id in the request: the record goes where the
		// auth token says, so nobody can sign for someone else.
		await seedPlayer('player-2', { firstname: 'Other', lastname: 'Person' })

		await sign(
			adultSubmission({ signerName: 'Other Person', playerId: PLAYER }),
			{ uid: 'player-2' }
		)

		expect(await readSignatures(PLAYER)).toHaveLength(0)
		expect(await isSigned(PLAYER)).toBe(false)
		expect(await readSignatures('player-2')).toHaveLength(1)
	})
})

describe('updatePlayerAdmin marking a player signed', () => {
	/**
	 * An admin can still tick "Signed Waiver" — a paper waiver, a correction.
	 * That leaves a record too, so every `signed: true` has one behind it.
	 */
	const ADMIN = 'admin-1'
	let updatePlayerAdmin: Callable

	const markSigned = (signed: boolean) =>
		updatePlayerAdmin.run({
			auth: authed(ADMIN),
			data: {
				playerId: PLAYER,
				seasons: [
					{
						seasonId: SEASON,
						captain: false,
						paid: false,
						signed,
						teamId: null,
					},
				],
			},
		} as unknown as CallableRequest<never>)

	beforeAll(async () => {
		const manifest = (await import('../../Functions/src/index.js')) as Record<
			string,
			unknown
		>
		updatePlayerAdmin = manifest.updatePlayerAdmin as Callable
	})

	beforeEach(async () => {
		await seedPlayer(ADMIN, { admin: true, firstname: 'Ada', lastname: 'Min' })
	})

	it('records who marked them signed, and flips the flag', async () => {
		await markSigned(true)

		expect(await isSigned()).toBe(true)
		expect(await readSignatures()).toMatchObject([
			{
				seasonId: SEASON,
				versionId: CURRENT_WAIVER_VERSION_ID,
				method: 'admin',
				recordedBy: ADMIN,
				participantName: 'Test Player',
				signerName: null,
				dateOfBirth: null,
				emergencyContacts: [],
			},
		])
	})

	it('adds no record when the player was already signed', async () => {
		await sign(adultSubmission())

		await markSigned(true)

		expect(await readSignatures()).toHaveLength(1)
		expect((await readSignatures())[0].method).toBe('player')
	})

	it('adds no record when marking a player unsigned', async () => {
		await markSigned(false)

		expect(await readSignatures()).toHaveLength(0)
	})
})
