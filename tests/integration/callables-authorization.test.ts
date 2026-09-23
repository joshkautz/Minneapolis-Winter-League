import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import {
	authed,
	type Callable,
	errorCodeFrom,
	initTestApp,
	resetFirestore,
	seedAuthUser,
	unverified,
} from './helpers.js'
import { VALID_PAYLOADS } from './payloads.js'

/**
 * Authorization sweep across every callable.
 *
 * firestore.rules denies all client writes, so these 47 functions are the
 * entire write path into the database. Each one's first job is to reject a
 * caller who should not be there. Individual callables have their own deeper
 * tests; this file proves none of them is missing the gate altogether —
 * the failure mode a per-function test suite is most likely to overlook,
 * because a new callable simply would not have a test file yet.
 *
 * The lists below are checked against Functions/src/index.ts, so adding a
 * callable without adding it here fails the suite.
 */

/** Requires validateAdminUser: admin-only operations. */
const ADMIN_CALLABLES = [
	'awardBadge',
	'createBadge',
	'createGame',
	'createNews',
	'createSeason',
	'deleteBadge',
	'deleteGame',
	'deleteNews',
	'deletePost',
	'deleteReply',
	'deleteSeason',
	'deleteUnregisteredTeam',
	'getPlayerAuthInfo',
	'getSwissRankings',
	'mergeTeams',
	'rebuildPlayerRankings',
	'revokeBadge',
	'sendWaiverAdmin',
	'setSwissSeeding',
	'updateBadge',
	'updateGame',
	'updateNews',
	'updatePlayerAdmin',
	'updatePlayerEmail',
	'updateSeason',
	'updateSiteSettings',
	'updateTeamAdmin',
] as const

/** Available to any signed-in player. */
const USER_CALLABLES = [
	'createOffer',
	'createPlayer',
	'createPost',
	'createReply',
	'createStripeCheckout',
	'createTeam',
	'createTeamContributionCheckout',
	'deletePlayer',
	'deleteTeam',
	'getDownloadUrl',
	'getFileMetadata',
	'getUploadUrl',
	'rolloverTeam',
	'sendWaiverReminder',
	'updateOffer',
	'updatePlayer',
	'updatePost',
	'updateReply',
	'updateTeam',
	'updateTeamRoster',
] as const

/**
 * Callables that deliberately accept an unverified email, because they run
 * before or during account setup. Both use validateBasicAuthentication.
 */
const ALLOWS_UNVERIFIED_EMAIL = new Set(['createPlayer', 'updatePlayer'])

/** Triggers and webhooks: not callables, excluded from the sweep. */
const NON_CALLABLES = new Set([
	'dropboxSignWebhook',
	'stripeWebhook',
	'onOfferUpdated',
	'onPaymentCreated',
	'onTeamRegistrationChange',
	'onRosterEntryCreated',
	'updateTeamRegistrationOnContributionChange',
	'updateTeamRegistrationOnPlayerChange',
	'updateTeamRegistrationOnRosterChange',
	'userDeleted',
])

let firestore: Firestore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifest: Record<string, any>

const callable = (name: string): Callable => manifest[name] as Callable

/**
 * Several callables validate their arguments before checking who is calling,
 * so an empty payload fails with `invalid-argument` whether or not an auth
 * gate exists. Sending a valid payload makes the next error the
 * authorization decision, which is the thing under test.
 */
const payload = (name: string): Record<string, unknown> => {
	const data = VALID_PAYLOADS[name]
	if (!data) throw new Error(`no valid payload defined for "${name}"`)
	return data
}

beforeAll(async () => {
	firestore = initTestApp()
	manifest = (await import('../../Functions/src/index.js')) as Record<
		string,
		unknown
	>
})

beforeEach(async () => {
	await resetFirestore(firestore)
	// Auth records: getUploadUrl reads emailVerified from the Auth record
	// rather than the token claim, so these have to exist.
	await seedAuthUser('player-1', true)
	await seedAuthUser('unverified-1', false)
	await seedAuthUser('admin-1', true)

	// A signed-in, non-admin player.
	await firestore.collection('players').doc('player-1').set({
		admin: false,
		email: 'p@example.com',
		firstname: 'P',
		lastname: 'One',
	})
	// A signed-in admin.
	await firestore.collection('players').doc('admin-1').set({
		admin: true,
		email: 'a@example.com',
		firstname: 'A',
		lastname: 'One',
	})
})

describe('the sweep covers every callable in the deploy manifest', () => {
	it('classifies every exported function', () => {
		const exported = Object.keys(manifest).filter(
			(k) => typeof manifest[k]?.run === 'function'
		)
		const classified = new Set<string>([
			...ADMIN_CALLABLES,
			...USER_CALLABLES,
			...NON_CALLABLES,
		])
		const unclassified = exported.filter((name) => !classified.has(name))

		// A new callable that nobody added here would otherwise sail through
		// with no authorization test at all.
		expect(unclassified).toEqual([])
	})

	it('lists only functions that actually exist', () => {
		const missing = [...ADMIN_CALLABLES, ...USER_CALLABLES].filter(
			(name) => typeof manifest[name]?.run !== 'function'
		)
		expect(missing).toEqual([])
	})

	it('covers all 47 callables', () => {
		expect(ADMIN_CALLABLES.length + USER_CALLABLES.length).toBe(47)
	})

	it('has a valid payload for every callable', () => {
		// Without one, the sweep below would be testing argument validation
		// rather than authorization.
		const missing = [...ADMIN_CALLABLES, ...USER_CALLABLES].filter(
			(name) => VALID_PAYLOADS[name] === undefined
		)
		expect(missing).toEqual([])
	})
})

describe.each([...ADMIN_CALLABLES, ...USER_CALLABLES])('%s', (name) => {
	it('rejects an unauthenticated caller', async () => {
		const code = await errorCodeFrom(callable(name), {
			auth: undefined,
			data: payload(name),
		})
		expect(code).toBe('unauthenticated')
	})

	it('rejects a caller with no uid', async () => {
		const code = await errorCodeFrom(callable(name), {
			auth: { token: {} } as never,
			data: payload(name),
		})
		expect(code).toBe('unauthenticated')
	})
})

describe.each(
	[...ADMIN_CALLABLES, ...USER_CALLABLES].filter(
		(n) => !ALLOWS_UNVERIFIED_EMAIL.has(n)
	)
)('%s email verification', (name) => {
	it('rejects a caller whose email is not verified', async () => {
		// Every operation that touches league data requires a verified email;
		// the exceptions are listed in ALLOWS_UNVERIFIED_EMAIL.
		const code = await errorCodeFrom(callable(name), {
			auth: unverified('unverified-1'),
			data: payload(name),
		})
		// Uniformly permission-denied, so a client can tell this apart from
		// 'unauthenticated' and prompt for verification rather than a login.
		expect(code).toBe('permission-denied')
	})
})

describe.each(ADMIN_CALLABLES)('%s admin gate', (name) => {
	it('rejects a verified non-admin', async () => {
		// Admin comes from the player document's `admin` boolean, never from
		// a token claim.
		const code = await errorCodeFrom(callable(name), {
			auth: authed('player-1'),
			data: payload(name),
		})
		expect(code).toBe('permission-denied')
	})

	it('rejects a caller with an admin claim on the token but not in Firestore', async () => {
		// Guards against trusting auth.token.admin, which is forgeable from
		// this codebase's perspective since it never sets custom claims.
		const code = await errorCodeFrom(callable(name), {
			auth: {
				uid: 'player-1',
				token: { email_verified: true, admin: true },
			} as never,
			data: payload(name),
		})
		expect(code).toBe('permission-denied')
	})

	it('rejects a caller with no player document at all', async () => {
		const code = await errorCodeFrom(callable(name), {
			auth: authed('ghost-user'),
			data: payload(name),
		})
		expect(code).toBe('permission-denied')
	})
})
