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
		await setDoc(doc(db, 'players/user-1'), { admin: false })
		await setDoc(doc(db, 'playerContacts/user-1'), { email: 'a@example.com' })
		await setDoc(doc(db, 'playerContacts/user-2'), { email: 'b@example.com' })
		await setDoc(doc(db, 'players/user-1/playerSeasons/season-1'), {
			paid: true,
		})
		await setDoc(doc(db, 'games/game-1'), { home: 1, away: 2 })
		await setDoc(doc(db, 'offers/offer-1'), { status: 'pending' })
		await setDoc(doc(db, 'stripe/user-1'), { stripeId: 'cus_1' })
		await setDoc(doc(db, 'stripe/user-1/payments/pay-1'), { amount: 100 })
		await setDoc(doc(db, 'dropbox/user-1/waivers/w-1'), { status: 'signed' })
		await setDoc(doc(db, 'players/user-1/waiverSignatures/sig-1'), {
			seasonId: 'season-1',
			dateOfBirth: '1990-05-17',
			mailingAddress: '123 Main St',
		})
		await setDoc(doc(db, 'system/maintenance'), { enabled: false })

		// Team payments. user-1 is on team-1's roster for season-1 only.
		await setDoc(
			doc(db, 'teams/team-1/teamSeasons/season-1/contributions/pi_1'),
			{ amountCents: 50_000, status: 'paid' }
		)
		await setDoc(doc(db, 'teams/team-1/teamSeasons/season-1/checkouts/open'), {
			reservations: { r1: { amountCents: 30_000 } },
		})
		await setDoc(doc(db, 'teams/team-1/teamSeasons/season-2'), {
			name: 'Test Team',
			registered: false,
		})
		await setDoc(
			doc(db, 'teams/team-1/teamSeasons/season-2/contributions/pi_2'),
			{ amountCents: 50_000, status: 'paid' }
		)
		await setDoc(doc(db, 'players/user-2'), {
			admin: false,
			email: 'b@example.com',
		})
		await setDoc(doc(db, 'players/admin-1'), {
			admin: true,
			email: 'admin@example.com',
		})
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
		'teams/team-1/teamSeasons/season-1/contributions/pi_1',
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

describe('player contacts', () => {
	// Emails live here rather than on the public player document, so that
	// anyone with the web config cannot list every player's address.
	const contact = 'playerContacts/user-1'

	it('are readable by the player they belong to', async () => {
		await assertSucceeds(getDoc(doc(verified('user-1'), contact)))
	})

	it('are readable, and listable, by an admin', async () => {
		await assertSucceeds(getDoc(doc(verified('admin-1'), contact)))
		await assertSucceeds(
			getDocs(collection(verified('admin-1'), 'playerContacts'))
		)
	})

	it('are not readable by another player', async () => {
		await assertFails(getDoc(doc(verified('user-2'), contact)))
	})

	it('cannot be listed by a player', async () => {
		await assertFails(getDocs(collection(verified('user-1'), 'playerContacts')))
	})

	it('are not readable while signed out', async () => {
		await assertFails(getDoc(doc(anonymous(), contact)))
		await assertFails(getDocs(collection(anonymous(), 'playerContacts')))
	})

	it('cannot be written, even by the player or an admin', async () => {
		await assertFails(
			setDoc(doc(verified('user-1'), contact), { email: 'new@example.com' })
		)
		await assertFails(
			setDoc(doc(verified('admin-1'), contact), { email: 'new@example.com' })
		)
	})
})

describe('waiver signatures', () => {
	// A signature holds a date of birth, an address and emergency contacts,
	// so unlike the public player document it sits under, only the player
	// and admins may read it — and nobody may write it from the client.
	const signature = 'players/user-1/waiverSignatures/sig-1'
	const signatures = 'players/user-1/waiverSignatures'

	it('are readable by the player they belong to', async () => {
		await assertSucceeds(getDoc(doc(verified('user-1'), signature)))
		await assertSucceeds(getDocs(collection(verified('user-1'), signatures)))
	})

	it('are readable by an admin', async () => {
		await assertSucceeds(getDoc(doc(verified('admin-1'), signature)))
		await assertSucceeds(getDocs(collection(verified('admin-1'), signatures)))
	})

	it('are not readable by another player', async () => {
		await assertFails(getDoc(doc(verified('user-2'), signature)))
		await assertFails(getDocs(collection(verified('user-2'), signatures)))
	})

	it('are not readable while signed out', async () => {
		await assertFails(getDoc(doc(anonymous(), signature)))
	})

	it('cannot be listed across players', async () => {
		await assertFails(
			getDocs(collectionGroup(verified('admin-1'), 'waiverSignatures'))
		)
	})

	it('cannot be written, even by the player or an admin', async () => {
		await assertFails(
			setDoc(doc(verified('user-1'), `${signatures}/forged`), {
				seasonId: 'season-1',
			})
		)
		await assertFails(
			setDoc(doc(verified('admin-1'), signature), { seasonId: 'season-2' })
		)
		await assertFails(deleteDoc(doc(verified('user-1'), signature)))
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

	it('allows an admin to read it but never to write it', async () => {
		await testEnv.withSecurityRulesDisabled(async (ctx) => {
			const db = ctx.firestore() as unknown as Firestore
			await setDoc(doc(db, 'players/admin-1'), {
				admin: true,
				email: 'admin@example.com',
			})
		})
		const db = verified('admin-1')
		await assertSucceeds(getDoc(doc(db, 'system/maintenance')))
		await assertFails(setDoc(doc(db, 'system/maintenance'), { enabled: true }))
	})
})

describe('team payments', () => {
	// What a team has paid, and who paid it, is its own business: visible to
	// its roster and to admins, never publicly or to other teams.
	const ledger = 'teams/team-1/teamSeasons/season-1/contributions'

	it('are readable by a player on the team’s roster', async () => {
		await assertSucceeds(getDoc(doc(verified('user-1'), `${ledger}/pi_1`)))
		await assertSucceeds(getDocs(collection(verified('user-1'), ledger)))
	})

	it('are readable by an admin', async () => {
		await assertSucceeds(getDoc(doc(verified('admin-1'), `${ledger}/pi_1`)))
		await assertSucceeds(getDocs(collection(verified('admin-1'), ledger)))
	})

	it('are not readable by a player on another team', async () => {
		await assertFails(getDoc(doc(verified('user-2'), `${ledger}/pi_1`)))
		await assertFails(getDocs(collection(verified('user-2'), ledger)))
	})

	it('are not readable while signed out', async () => {
		await assertFails(getDoc(doc(anonymous(), `${ledger}/pi_1`)))
		await assertFails(getDocs(collection(anonymous(), ledger)))
	})

	it('follow the roster for that season, not the team in general', async () => {
		// user-1 is on team-1 for season-1, not season-2.
		await assertFails(
			getDoc(
				doc(
					verified('user-1'),
					'teams/team-1/teamSeasons/season-2/contributions/pi_2'
				)
			)
		)
	})

	it('cannot be listed across teams, even by a rostered player', async () => {
		await assertFails(
			getDocs(collectionGroup(verified('user-1'), 'contributions'))
		)
		await assertFails(getDocs(collectionGroup(anonymous(), 'contributions')))
	})

	it('cannot be written, even by an admin', async () => {
		await assertFails(
			setDoc(doc(verified('admin-1'), `${ledger}/pi_1`), { status: 'refunded' })
		)
		await assertFails(
			setDoc(doc(verified('user-1'), `${ledger}/pi_new`), { amountCents: 1 })
		)
	})
})

describe('open team checkouts', () => {
	// Who is paying what right now: private exactly as the ledger is.
	const open = 'teams/team-1/teamSeasons/season-1/checkouts/open'

	it('are readable by a player on the team’s roster, and by an admin', async () => {
		await assertSucceeds(getDoc(doc(verified('user-1'), open)))
		await assertSucceeds(getDoc(doc(verified('admin-1'), open)))
	})

	it('are not readable by a player on another team, or signed out', async () => {
		await assertFails(getDoc(doc(verified('user-2'), open)))
		await assertFails(getDoc(doc(anonymous(), open)))
	})

	it('cannot be listed across teams', async () => {
		await assertFails(
			getDocs(collectionGroup(verified('admin-1'), 'checkouts'))
		)
	})

	it('cannot be written, even by an admin or a rostered player', async () => {
		// A reservation written from the client would block a team's payments.
		await assertFails(
			setDoc(doc(verified('admin-1'), open), { reservations: {} })
		)
		await assertFails(
			setDoc(doc(verified('user-1'), open), { reservations: {} })
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
