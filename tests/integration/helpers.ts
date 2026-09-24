import { initializeApp, getApps, getApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import type { CallableRequest } from 'firebase-functions/v2/https'

/**
 * Shared harness for callable integration tests.
 *
 * firebase-functions v2 gives every callable a `.run(request)` specifically
 * for testing, so the real handler executes against the Firestore emulator —
 * no mocking, and no firebase-functions-test dependency.
 */

export const PROJECT_ID = 'mwl-integration-test'

/** Points the Admin SDK at the emulator and initialises the default app. */
export function initTestApp(): Firestore {
	process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
	process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
	process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199'
	process.env.GCLOUD_PROJECT ??= PROJECT_ID
	process.env.FIREBASE_CONFIG ??= JSON.stringify({ projectId: PROJECT_ID })
	if (getApps().length === 0) {
		initializeApp({ projectId: PROJECT_ID })
	} else {
		getApp()
	}
	return getFirestore()
}

/** A callable as exported from Functions/src/index.ts. */
export type Callable = {
	run: (request: CallableRequest<never>) => unknown
}

/** An authenticated caller with a verified email. */
export const authed = (uid: string): CallableRequest<never>['auth'] =>
	({
		uid,
		token: { email_verified: true, email: `${uid}@example.com` },
	}) as unknown as NonNullable<CallableRequest<never>['auth']>

/** An authenticated caller whose email is not verified. */
export const unverified = (uid: string): CallableRequest<never>['auth'] =>
	({
		uid,
		token: { email_verified: false, email: `${uid}@example.com` },
	}) as unknown as NonNullable<CallableRequest<never>['auth']>

/** Invokes a callable and returns the HttpsError code it threw, or null. */
export async function errorCodeFrom(
	fn: Callable,
	request: { auth?: CallableRequest<never>['auth']; data?: unknown }
): Promise<string | null> {
	try {
		await fn.run({
			auth: request.auth,
			data: request.data ?? {},
		} as unknown as CallableRequest<never>)
		return null
	} catch (error) {
		const code = (error as { code?: string }).code
		return code ?? `non-https-error: ${(error as Error).message}`
	}
}

/** Wipes every collection the tests touch. */
export async function resetFirestore(firestore: Firestore): Promise<void> {
	const collections = await firestore.listCollections()
	await Promise.all(collections.map((c) => firestore.recursiveDelete(c)))
}

/**
 * Creates the Auth user behind a uid. Some callables read email verification
 * from the Auth record rather than the token claim, so the record has to
 * exist for those paths to behave as they do in production.
 */
export async function seedAuthUser(
	uid: string,
	emailVerified: boolean
): Promise<void> {
	const auth = getAuth()
	try {
		await auth.deleteUser(uid)
	} catch {
		// Not present yet; nothing to clean up.
	}
	await auth.createUser({
		uid,
		email: `${uid}@example.com`,
		emailVerified,
	})
}

/**
 * What a team's ledger holds and has taken, summed the way the Functions do.
 * The ledger is the only record of a team's money; nothing keeps a total.
 */
export async function ledgerTotals(
	firestore: Firestore,
	teamId: string,
	seasonId: string
): Promise<{ authorizedCents: number; capturedCents: number }> {
	const { teamContributionsCollection, totalsFrom } =
		await import('../../Functions/src/shared/contributions.js')
	const snap = await teamContributionsCollection(
		firestore,
		teamId,
		seasonId
	).get()
	return totalsFrom(
		snap.docs.map((d) => d.data() as Parameters<typeof totalsFrom>[0][number])
	)
}
