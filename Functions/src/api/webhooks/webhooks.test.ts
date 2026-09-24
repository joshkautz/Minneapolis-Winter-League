import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Webhook guard tests.
 *
 * The Stripe webhook is `invoker: 'public'` — anyone on the internet can POST
 * to it. The signature check is therefore the only thing separating a real
 * Stripe event from a forged one, and it must happen *before*
 * any Firestore write. These tests pin that ordering: a request that fails a
 * guard must return the right status and must not touch the database.
 */

import type { Request, Response } from 'firebase-functions/v2/https'

const constructEvent = vi.fn()
const firestoreCollection = vi.fn()

vi.mock('firebase-functions/v2/https', () => ({
	// onRequest normally wraps the handler for the Functions runtime; here it
	// just hands the handler back so tests can invoke it directly.
	onRequest: (_opts: unknown, handler: unknown) => handler,
}))

vi.mock('firebase-functions/v2', () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('firebase-admin/firestore', () => ({
	getFirestore: () => ({ collection: firestoreCollection }),
	FieldValue: { serverTimestamp: () => 'ts' },
	Timestamp: { fromMillis: (m: number) => ({ toMillis: () => m }) },
}))

vi.mock('../../config/constants.js', () => ({
	FIREBASE_CONFIG: { REGION: 'us-central1' },
	getStripeConfig: () => ({
		SECRET_KEY: 'sk_test_x',
		WEBHOOK_SECRET: 'whsec_x',
		API_VERSION: '2026-08-26.dahlia',
	}),
}))

vi.mock('stripe', () => ({
	default: class {
		webhooks = { constructEvent }
	},
}))

/** Captures status/body so assertions can read what the handler sent. */
const makeResponse = (): Response & {
	statusCode?: number
	body?: unknown
} => {
	const res: Record<string, unknown> = {}
	res.status = vi.fn((code: number) => {
		res.statusCode = code
		return res
	})
	res.send = vi.fn((body: unknown) => {
		res.body = body
		return res
	})
	return res as unknown as Response & { statusCode?: number; body?: unknown }
}

beforeEach(() => {
	vi.clearAllMocks()
})

describe('stripeWebhook', () => {
	const load = async (): Promise<
		(req: Request, resp: Response) => Promise<void>
	> => {
		const mod = await import('./stripe.js')
		return mod.stripeWebhook as unknown as (
			req: Request,
			resp: Response
		) => Promise<void>
	}

	it('rejects non-POST methods with 405', async () => {
		const handler = await load()
		const resp = makeResponse()
		await handler({ method: 'GET', headers: {} } as Request, resp)

		expect(resp.statusCode).toBe(405)
		expect(constructEvent).not.toHaveBeenCalled()
		expect(firestoreCollection).not.toHaveBeenCalled()
	})

	it('rejects a request with no stripe-signature header with 400', async () => {
		const handler = await load()
		const resp = makeResponse()
		await handler(
			{ method: 'POST', headers: {}, rawBody: Buffer.from('{}') } as Request,
			resp
		)

		expect(resp.statusCode).toBe(400)
		expect(constructEvent).not.toHaveBeenCalled()
		expect(firestoreCollection).not.toHaveBeenCalled()
	})

	it('rejects a forged signature with 401 and writes nothing', async () => {
		constructEvent.mockImplementation(() => {
			throw new Error('No signatures found matching the expected signature')
		})
		const handler = await load()
		const resp = makeResponse()
		await handler(
			{
				method: 'POST',
				headers: { 'stripe-signature': 't=1,v1=forged' },
				rawBody: Buffer.from('{"type":"checkout.session.completed"}'),
			} as unknown as Request,
			resp
		)

		expect(resp.statusCode).toBe(401)
		expect(firestoreCollection).not.toHaveBeenCalled()
	})

	it('verifies the signature against the raw body, not the parsed body', async () => {
		// Stripe signs the exact bytes received. Verifying a re-serialized
		// body would let an attacker alter semantically-equivalent JSON.
		const rawBody = Buffer.from('{"type":"product.created"}')
		constructEvent.mockReturnValue({
			id: 'evt_1',
			type: 'product.created',
			data: { object: { id: 'prod_1' } },
		})
		const handler = await load()
		await handler(
			{
				method: 'POST',
				headers: { 'stripe-signature': 't=1,v1=good' },
				rawBody,
			} as unknown as Request,
			makeResponse()
		)

		expect(constructEvent).toHaveBeenCalledWith(
			rawBody,
			't=1,v1=good',
			'whsec_x'
		)
	})
})
