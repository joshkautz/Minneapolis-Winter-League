import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
	authed,
	DAY_MS,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	seedAuthUser,
} from './helpers.js'
import { resolveBanReview, signWaiver } from '../../Functions/src/index.js'
import { waiverVersionForSeason } from '../../Functions/src/waiver/versions.js'

/** Its seasons record no waiver version, so they are signed on the original. */
const SEASON_WAIVER_VERSION_ID = waiverVersionForSeason({})!.id

/**
 * A banned player signing up again under a new account. Their waiver is
 * signed as usual, but one that shares enough with a banned player's
 * records is flagged for the admins, who decide: ban, or someone else.
 */

const SEASON = 'season-5'
const BANNED = 'banned-1'
const NEW = 'new-1'
const ADMIN = 'admin-1'

let firestore: Firestore

const playerRef = (id: string) => firestore.collection('players').doc(id)
const review = async (id = NEW) =>
	(await firestore.collection('banReviews').doc(id).get()).data()
const alerts = async () =>
	(
		await firestore
			.collection('mail')
			.where('template', '==', 'banReviewAlert')
			.get()
	).docs.map((doc) => doc.data())

const submission = (overrides: Record<string, unknown> = {}) => ({
	versionId: SEASON_WAIVER_VERSION_ID,
	dateOfBirth: '2001-04-09',
	mailingAddress: '12 Elm St, Minneapolis, MN 55401',
	emergencyContacts: [
		{ name: 'Sam Doe', relationship: 'Parent', phone: '(612) 555-0100' },
	],
	signerName: 'Aidenn Lomen',
	agreed: true,
	...overrides,
})

const sign = (uid: string, data = submission()) =>
	signWaiver.run({
		auth: authed(uid),
		data,
		rawRequest: { ip: '203.0.113.9', headers: {} },
	} as unknown as CallableRequest<never>) as Promise<{ alreadySigned: boolean }>

const decide = (decision: 'ban' | 'dismiss', uid = ADMIN) =>
	resolveBanReview.run({
		auth: authed(uid),
		data: { playerId: NEW, decision },
	} as unknown as CallableRequest<never>)

const seedPlayer = async (
	uid: string,
	firstname: string,
	lastname: string,
	extra: Record<string, unknown> = {}
) => {
	await seedAuthUser(uid, true)
	await playerRef(uid).set({
		admin: false,
		banned: false,
		firstname,
		lastname,
		...extra,
	})
	await playerRef(uid)
		.collection('playerSeasons')
		.doc(SEASON)
		.set({
			season: firestore.collection('seasons').doc(SEASON),
			team: null,
			paid: false,
			signed: false,
			captain: false,
		})
}

/** The banned player's waiver from an earlier season. */
const seedBannedWaiver = (overrides: Record<string, unknown> = {}) =>
	playerRef(BANNED)
		.collection('waiverSignatures')
		.add({
			seasonId: 'season-4',
			participantName: 'Aiden Lomen',
			dateOfBirth: '2001-04-09',
			mailingAddress: '12 Elm St, Minneapolis, MN 55401',
			emergencyContacts: [
				{ name: 'Sam Doe', relationship: 'Parent', phone: '612-555-0100' },
			],
			ipAddress: '198.51.100.7',
			...overrides,
		})

beforeAll(() => {
	firestore = initTestApp()
})

beforeEach(async () => {
	await resetFirestore(firestore)
	await firestore
		.collection('seasons')
		.doc(SEASON)
		.set({
			name: 'Season 5',
			dateStart: Timestamp.fromMillis(Date.now() + 10 * DAY_MS),
			dateEnd: Timestamp.fromMillis(Date.now() + 60 * DAY_MS),
		})
	await seedPlayer(BANNED, 'Aiden', 'Lomen', { banned: true })
	await seedPlayer(NEW, 'Aidenn', 'Lomen')
	await seedPlayer(ADMIN, 'Ada', 'Min', { admin: true })
	await seedBannedWaiver()
})

describe('signing a waiver that resembles a banned player’s', () => {
	it('signs it, and flags the account for review', async () => {
		await expect(sign(NEW)).resolves.toMatchObject({ alreadySigned: false })

		expect(
			(
				await playerRef(NEW).collection('playerSeasons').doc(SEASON).get()
			).data()?.signed
		).toBe(true)
		expect(await review()).toMatchObject({
			playerId: NEW,
			playerName: 'Aidenn Lomen',
			status: 'open',
			seasonId: SEASON,
			matches: [
				{
					bannedPlayerId: BANNED,
					bannedPlayerName: 'Aiden Lomen',
					signals: expect.arrayContaining([
						'last name',
						'date of birth',
						'mailing address',
						'emergency contact phone',
					]),
				},
			],
		})
	})

	it('emails each admin, naming the accounts but not the details', async () => {
		await sign(NEW)

		const [alert] = await alerts()
		expect(await alerts()).toHaveLength(1)
		expect(alert).toMatchObject({
			toPlayerId: ADMIN,
			category: 'account',
			props: { playerName: 'Aidenn Lomen' },
		})
		expect(JSON.stringify(alert.props)).not.toMatch(/2001|Elm|555/)
	})

	it('flags nobody whose waiver shares at most one thing', async () => {
		await sign(
			NEW,
			submission({
				mailingAddress: '9 Oak Ave, St Paul, MN 55101',
				emergencyContacts: [
					{ name: 'Lee Roe', relationship: 'Partner', phone: '651-555-0199' },
				],
				dateOfBirth: '1995-06-01',
			})
		)

		expect(await review()).toBeUndefined()
		expect(await alerts()).toHaveLength(0)
	})

	it('compares only with banned players', async () => {
		await playerRef(BANNED).update({ banned: false })

		await sign(NEW)

		expect(await review()).toBeUndefined()
	})

	it('does not raise again what an admin dismissed', async () => {
		await sign(NEW)
		await decide('dismiss')
		await playerRef(NEW)
			.collection('playerSeasons')
			.doc(SEASON)
			.update({ signed: false })

		await sign(NEW)

		expect((await review())?.status).toBe('dismissed')
		expect(await alerts()).toHaveLength(1)
	})
})

describe('resolveBanReview', () => {
	beforeEach(async () => {
		await sign(NEW)
	})

	it('bans the account and closes the review', async () => {
		await expect(decide('ban')).resolves.toEqual({ status: 'banned' })

		expect((await playerRef(NEW).get()).data()?.banned).toBe(true)
		expect(await review()).toMatchObject({
			status: 'banned',
			resolvedBy: ADMIN,
		})
	})

	it('closes the review, leaving the account as it is, when dismissed', async () => {
		await expect(decide('dismiss')).resolves.toEqual({ status: 'dismissed' })

		expect((await playerRef(NEW).get()).data()?.banned).toBe(false)
		expect((await review())?.status).toBe('dismissed')
	})

	it('refuses a review already decided, or one that does not exist', async () => {
		await decide('dismiss')
		expect(
			await errorCodeFrom(resolveBanReview, {
				auth: authed(ADMIN),
				data: { playerId: NEW, decision: 'ban' },
			})
		).toBe('failed-precondition')
		expect(
			await errorCodeFrom(resolveBanReview, {
				auth: authed(ADMIN),
				data: { playerId: 'nobody', decision: 'ban' },
			})
		).toBe('not-found')
	})

	it('refuses a decision that is neither', async () => {
		expect(
			await errorCodeFrom(resolveBanReview, {
				auth: authed(ADMIN),
				data: { playerId: NEW, decision: 'maybe' },
			})
		).toBe('invalid-argument')
	})

	it('refuses a player who is not an admin', async () => {
		expect(
			await errorCodeFrom(resolveBanReview, {
				auth: authed(NEW),
				data: { playerId: NEW, decision: 'dismiss' },
			})
		).toBe('permission-denied')
	})
})
