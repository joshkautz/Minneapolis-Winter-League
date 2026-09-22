import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	assertFails,
	assertSucceeds,
	initializeTestEnvironment,
	type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
	doc,
	getDoc,
	setDoc,
	deleteDoc,
	collection,
	collectionGroup,
	getDocs,
	type Firestore,
} from 'firebase/firestore'

/**
 * Security-rules tests for firestore.rules.
 *
 * The whole security model rests on one invariant: **the client can read
 * league data and write nothing**. Every mutation goes through a Cloud
 * Function on the Admin SDK, which bypasses rules entirely. A rules change
 * that accidentally opens a write is therefore not caught anywhere else —
 * not by typecheck, not by the App, not by the Functions tests.
 *
 * These run against the Firestore emulator. `npm run test:rules` starts it.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

let testEnv: RulesTestEnvironment

/** Authenticated as a verified user (the normal signed-in case). */
const verified = (uid = 'user-1'): Firestore =>
	testEnv
		.authenticatedContext(uid, { email_verified: true })
		.firestore() as unknown as Firestore

/** Signed out. */
const anonymous = (): Firestore =>
	testEnv.unauthenticatedContext().firestore() as unknown as Firestore

beforeAll(async () => {
	testEnv = await initializeTestEnvironment({
		projectId: 'mwl-rules-test',
		firestore: {
			rules: readFileSync(resolve(repoRoot, 'firestore.rules'), 'utf8'),
			host: '127.0.0.1',
			port: 8080,
		},
	})
})

afterAll(async () => {
	await testEnv?.cleanup()
})

beforeEach(async () => {
	await testEnv.clearFirestore()

	// Seed through a context that bypasses rules, the way Functions do.
	await testEnv.withSecurityRulesDisabled(async (ctx) => {
		const db = ctx.firestore() as unknown as Firestore
		await setDoc(doc(db, 'seasons/season-1'), { name: '2026 Winter' })
		await setDoc(doc(db, 'teams/team-1'), { createdAt: new Date() })
		await setDoc(doc(db, 'teams/team-1/teamSeasons/season-1'), {
			name: 'Test Team',
			registered: true,
		})
		await setDoc(doc(db, 'teams/team-1/teamSeasons/season-1/roster/user-1'), {
			dateJoined: new Date(),
		})
		await setDoc(doc(db, 'players/user-1'), {
			admin: false,
			email: 'a@example.com',
		})
		await setDoc(doc(db, 'players/user-1/playerSeasons/season-1'), {
			paid: true,
		})
		await setDoc(doc(db, 'games/game-1'), { home: 1, away: 2 })
		await setDoc(doc(db, 'offers/offer-1'), { status: 'pending' })
		await setDoc(doc(db, 'stripe/user-1'), { stripeId: 'cus_1' })
		await setDoc(doc(db, 'stripe/user-1/payments/pay-1'), { amount: 100 })
		await setDoc(doc(db, 'dropbox/user-1/waivers/w-1'), { status: 'signed' })
		await setDoc(doc(db, 'system/maintenance'), { enabled: false })
	})
})

describe('public league data', () => {
	const publicPaths = [
		'seasons/season-1',
		'teams/team-1',
		'teams/team-1/teamSeasons/season-1',
		'players/user-1',
		'players/user-1/playerSeasons/season-1',
		'games/game-1',
		'offers/offer-1',
	]

	it('is readable while signed out', async () => {
		const db = anonymous()
		for (const path of publicPaths) {
			await assertSucceeds(getDoc(doc(db, path)))
		}
	})

	it('is readable while signed in', async () => {
		const db = verified()
		for (const path of publicPaths) {
			await assertSucceeds(getDoc(doc(db, path)))
		}
	})
})

describe('client writes are denied everywhere', () => {
	// The core invariant. If any of these starts passing, a Cloud Function
	// has been bypassed and the server-side validation with it.
	const writablePaths = [
		'seasons/season-1',
		'teams/team-1',
		'teams/team-1/teamSeasons/season-1',
		'teams/team-1/teamSeasons/season-1/roster/user-1',
		'players/user-1',
		'players/user-1/playerSeasons/season-1',
		'games/game-1',
		'offers/offer-1',
		'news/news-1',
		'badges/badge-1',
		'rankings/user-1',
		'siteSettings/theme',
		'posts/post-1',
		'posts/post-1/replies/reply-1',
	]

	it('rejects creates and updates from a verified user', async () => {
		const db = verified()
		for (const path of writablePaths) {
			await assertFails(setDoc(doc(db, path), { tampered: true }))
		}
	})

	it('rejects deletes from a verified user', async () => {
		const db = verified()
		for (const path of writablePaths) {
			await assertFails(deleteDoc(doc(db, path)))
		}
	})

	it('rejects writes from an anonymous client', async () => {
		const db = anonymous()
		for (const path of writablePaths) {
			await assertFails(setDoc(doc(db, path), { tampered: true }))
		}
	})

	it('rejects a player granting themselves admin', async () => {
		// The single most valuable denial: admin is read from this field.
		await assertFails(
			setDoc(doc(verified(), 'players/user-1'), { admin: true })
		)
	})
})

describe('per-user private data', () => {
	it('lets a user read their own stripe and waiver documents', async () => {
		const db = verified('user-1')
		await assertSucceeds(getDoc(doc(db, 'stripe/user-1')))
		await assertSucceeds(getDoc(doc(db, 'stripe/user-1/payments/pay-1')))
		await assertSucceeds(getDoc(doc(db, 'dropbox/user-1/waivers/w-1')))
	})

	it("denies reading another user's stripe and waiver documents", async () => {
		const db = verified('someone-else')
		await assertFails(getDoc(doc(db, 'stripe/user-1')))
		await assertFails(getDoc(doc(db, 'stripe/user-1/payments/pay-1')))
		await assertFails(getDoc(doc(db, 'dropbox/user-1/waivers/w-1')))
	})

	it('denies writing payment and waiver documents even to your own path', async () => {
		const db = verified('user-1')
		await assertFails(
			setDoc(doc(db, 'stripe/user-1/payments/pay-2'), { amount: 1 })
		)
		await assertFails(
			setDoc(doc(db, 'dropbox/user-1/waivers/w-2'), { status: 'signed' })
		)
	})

	it('denies reading private data while signed out', async () => {
		await assertFails(getDoc(doc(anonymous(), 'stripe/user-1')))
	})
})

describe('collection group queries', () => {
	// These need their own `match /{path=**}/...` blocks; without them the
	// App's queries fail even though the direct paths are readable.
	it('allows reading the teamSeasons, playerSeasons and roster groups', async () => {
		const db = anonymous()
		await assertSucceeds(getDocs(collectionGroup(db, 'teamSeasons')))
		await assertSucceeds(getDocs(collectionGroup(db, 'playerSeasons')))
	})

	it('allows listing a team roster', async () => {
		await assertSucceeds(
			getDocs(
				collection(anonymous(), 'teams/team-1/teamSeasons/season-1/roster')
			)
		)
	})
})

describe('system maintenance flag', () => {
	it('denies reads and writes to a non-admin', async () => {
		const db = verified('user-1')
		await assertFails(getDoc(doc(db, 'system/maintenance')))
		await assertFails(setDoc(doc(db, 'system/maintenance'), { enabled: true }))
	})

	it('denies reads while signed out', async () => {
		await assertFails(getDoc(doc(anonymous(), 'system/maintenance')))
	})

	it('allows an admin to read and write', async () => {
		await testEnv.withSecurityRulesDisabled(async (ctx) => {
			const db = ctx.firestore() as unknown as Firestore
			await setDoc(doc(db, 'players/admin-1'), {
				admin: true,
				email: 'admin@example.com',
			})
		})
		const db = verified('admin-1')
		await assertSucceeds(getDoc(doc(db, 'system/maintenance')))
		await assertSucceeds(
			setDoc(doc(db, 'system/maintenance'), { enabled: true })
		)
	})
})

describe('unknown collections', () => {
	it('are denied by the catch-all rule', async () => {
		const db = verified()
		await assertFails(getDoc(doc(db, 'not-a-real-collection/doc-1')))
		await assertFails(setDoc(doc(db, 'not-a-real-collection/doc-1'), { x: 1 }))
	})
})
