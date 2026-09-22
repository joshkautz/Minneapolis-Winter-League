import { describe, expect, it, vi } from 'vitest'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import {
	isPlayerBanned,
	validateAdminUser,
	validateAuthentication,
	validateBasicAuthentication,
	validateNotBanned,
} from './auth.js'

/**
 * These validators are the entire authorization boundary for this codebase:
 * firestore.rules denies every client write, so a callable that skips or
 * misuses one of these is the only thing between a request and the database.
 */

type Auth = CallableRequest['auth']

const authOf = (overrides: Record<string, unknown> = {}): Auth =>
	({
		uid: 'user-1',
		token: { email_verified: true },
		...overrides,
	}) as unknown as NonNullable<Auth>

/** Minimal Firestore stub: players/{uid} plus the playerSeasons subdoc. */
const firestoreStub = (opts: {
	player?: Record<string, unknown> | null
	playerSeason?: Record<string, unknown> | null
}): Firestore => {
	const seasonDoc = {
		get: vi.fn(async () => ({
			exists: opts.playerSeason !== null && opts.playerSeason !== undefined,
			data: () => opts.playerSeason ?? undefined,
		})),
	}
	const seasonsCollection = { doc: vi.fn(() => seasonDoc) }
	const playerDoc = {
		get: vi.fn(async () => ({
			exists: opts.player !== null && opts.player !== undefined,
			data: () => opts.player ?? undefined,
		})),
		collection: vi.fn(() => seasonsCollection),
	}
	return {
		collection: vi.fn(() => ({ doc: vi.fn(() => playerDoc) })),
	} as unknown as Firestore
}

/** Asserts the thrown error is an HttpsError carrying `code`. */
const expectHttpsError = (fn: () => unknown, code: string): void => {
	try {
		fn()
	} catch (error) {
		expect(error).toBeInstanceOf(HttpsError)
		expect((error as HttpsError).code).toBe(code)
		return
	}
	throw new Error(`expected an HttpsError with code "${code}", none thrown`)
}

const expectHttpsErrorAsync = async (
	fn: () => Promise<unknown>,
	code: string
): Promise<void> => {
	try {
		await fn()
	} catch (error) {
		expect(error).toBeInstanceOf(HttpsError)
		expect((error as HttpsError).code).toBe(code)
		return
	}
	throw new Error(`expected an HttpsError with code "${code}", none thrown`)
}

describe('validateAuthentication', () => {
	it('accepts an authenticated user with a verified email', () => {
		expect(() => validateAuthentication(authOf())).not.toThrow()
	})

	it('rejects a missing auth context as unauthenticated', () => {
		expectHttpsError(() => validateAuthentication(undefined), 'unauthenticated')
	})

	it('rejects an auth context with no uid', () => {
		expectHttpsError(
			() => validateAuthentication(authOf({ uid: undefined })),
			'unauthenticated'
		)
	})

	it('rejects an unverified email with permission-denied', () => {
		expectHttpsError(
			() =>
				validateAuthentication(authOf({ token: { email_verified: false } })),
			'permission-denied'
		)
	})

	it('rejects a missing token entirely', () => {
		expectHttpsError(
			() => validateAuthentication(authOf({ token: undefined })),
			'permission-denied'
		)
	})
})

describe('validateBasicAuthentication', () => {
	it('accepts an unverified email, unlike validateAuthentication', () => {
		expect(() =>
			validateBasicAuthentication(authOf({ token: { email_verified: false } }))
		).not.toThrow()
	})

	it('still rejects a missing auth context', () => {
		expectHttpsError(
			() => validateBasicAuthentication(undefined),
			'unauthenticated'
		)
	})
})

describe('validateAdminUser', () => {
	it('returns the uid when the player document has admin true', async () => {
		const firestore = firestoreStub({ player: { admin: true } })
		await expect(validateAdminUser(authOf(), firestore)).resolves.toBe('user-1')
	})

	it('rejects a signed-in non-admin', async () => {
		const firestore = firestoreStub({ player: { admin: false } })
		await expectHttpsErrorAsync(
			() => validateAdminUser(authOf(), firestore),
			'permission-denied'
		)
	})

	it('rejects when the player document does not exist', async () => {
		const firestore = firestoreStub({ player: null })
		await expectHttpsErrorAsync(
			() => validateAdminUser(authOf(), firestore),
			'permission-denied'
		)
	})

	it('rejects an unverified email before consulting Firestore', async () => {
		const firestore = firestoreStub({ player: { admin: true } })
		await expectHttpsErrorAsync(
			() =>
				validateAdminUser(
					authOf({ token: { email_verified: false } }),
					firestore
				),
			'permission-denied'
		)
		expect(firestore.collection).not.toHaveBeenCalled()
	})

	it('does not treat an admin claim on the auth token as admin', async () => {
		// Admin is sourced from the player document, never from custom claims.
		// A forged or stale token claim must not grant admin.
		const firestore = firestoreStub({ player: { admin: false } })
		await expectHttpsErrorAsync(
			() =>
				validateAdminUser(
					authOf({ token: { email_verified: true, admin: true } }),
					firestore
				),
			'permission-denied'
		)
	})
})

/**
 * A ban lives on the player document — `players/{uid}.banned`. It used to be
 * recorded on each season subdoc, which is what made it impossible to lift:
 * clearing one season left the others set and the next carry-forward
 * reinstated it. The season field is gone; nothing reads it.
 */
describe('validateNotBanned', () => {
	it('passes for a player who is not banned', async () => {
		const firestore = firestoreStub({ player: { banned: false } })
		await expect(
			validateNotBanned(firestore, 'user-1')
		).resolves.toBeUndefined()
	})

	it('passes for a player document with no banned field', async () => {
		// Every player was given the field by the backfill, so an absent one
		// is a new or hand-written document, not an unmigrated ban.
		const firestore = firestoreStub({ player: {} })
		await expect(
			validateNotBanned(firestore, 'user-1')
		).resolves.toBeUndefined()
	})

	it('rejects a banned player', async () => {
		const firestore = firestoreStub({ player: { banned: true } })
		await expectHttpsErrorAsync(
			() => validateNotBanned(firestore, 'user-1'),
			'permission-denied'
		)
	})

	it('treats a non-boolean banned value as not banned', async () => {
		// The check is `=== true`, so only an explicit boolean bans. This
		// pins that behavior so a truthy string cannot silently start banning.
		const firestore = firestoreStub({ player: { banned: 'yes' } })
		await expect(
			validateNotBanned(firestore, 'user-1')
		).resolves.toBeUndefined()
	})

	it('ignores a leftover ban on a season subdoc', async () => {
		// Residual data from before the migration must not resurrect a ban
		// that has since been lifted on the player document.
		const firestore = firestoreStub({
			player: { banned: false },
			playerSeason: { banned: true },
		})
		await expect(
			validateNotBanned(firestore, 'user-1')
		).resolves.toBeUndefined()
	})
})

describe('isPlayerBanned', () => {
	it('reports true only for an explicit boolean ban', async () => {
		await expect(
			isPlayerBanned(firestoreStub({ player: { banned: true } }), 'u')
		).resolves.toBe(true)
		await expect(
			isPlayerBanned(firestoreStub({ player: { banned: false } }), 'u')
		).resolves.toBe(false)
		await expect(
			isPlayerBanned(firestoreStub({ player: null }), 'u')
		).resolves.toBe(false)
	})
})
