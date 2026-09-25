/**
 * An in-memory Stripe for settlement tests.
 *
 * A call-recording mock can say "capture was called"; it cannot say whether
 * capturing a hold that another settlement already cancelled fails, or what
 * a PaymentIntent looks like after a partial capture. Settlement depends on
 * exactly those behaviours — it reads Stripe before acting and records what
 * Stripe reports afterwards — so this models the state, with the rules the
 * real API enforces:
 *
 * - capture and cancel only from `requires_capture`
 * - a capture of less than the hold releases the rest
 * - refunds only from `succeeded`, never more than is left
 * - an idempotency key replays its first result, whatever has happened since
 * - a Checkout session only holds money once the payer completes it
 *   (`completeCheckout`), and the hold carries the session's PaymentIntent
 *   metadata and amount, as Stripe's does
 *
 * Use it as the SDK's default export:
 *
 *   vi.mock('stripe', async () => ({
 *     default: (await import('./fake-stripe.js')).FakeStripe,
 *   }))
 */

export interface FakePaymentIntent {
	id: string
	status: 'requires_capture' | 'succeeded' | 'canceled'
	amount: number
	amount_capturable: number
	amount_received: number
	metadata: Record<string, string>
	latest_charge: {
		id: string
		amount_refunded: number
		payment_method_details: { card: { capture_before: number } }
	}
}

type Method = 'retrieve' | 'capture' | 'cancel' | 'refund'

interface FakeState {
	intents: Map<string, FakePaymentIntent>
	/** Every mutating call, in order, with its arguments. */
	calls: {
		method: Exclude<Method, 'retrieve'>
		paymentIntentId: string
		amount?: number
	}[]
	idempotent: Map<string, unknown>
	/** Fail the next call of `method` for `paymentIntentId`, once. */
	failures: { method: Method; paymentIntentId: string; message: string }[]
	/** What `webhooks.constructEvent` returns: the event being delivered. */
	nextEvent: unknown
	/** Every search query sent, in order. */
	searches: string[]
	/**
	 * Holds retrieves of one PaymentIntent until `count` callers are waiting,
	 * then lets them all through at once, so concurrent settlements all read
	 * the hold before any of them acts on it. Without it they happen to run
	 * one after another and a race is never actually tested.
	 */
	retrieveGate: {
		paymentIntentId: string
		count: number
		waiting: (() => void)[]
	} | null
	/** Checkout sessions created, by id, with the parameters sent. */
	sessions: Map<string, FakeCheckoutSession>
	customers: Set<string>
	products: Set<string>
}

/** What the code sends `checkout.sessions.create`, as far as the fake reads. */
interface CheckoutSessionParams {
	customer?: string
	line_items: { price_data: { unit_amount: number } }[]
	payment_intent_data: {
		capture_method: string
		metadata: Record<string, string>
	}
	metadata: Record<string, string>
}

export interface FakeCheckoutSession {
	id: string
	url: string
	params: CheckoutSessionParams
	paymentIntentId: string | null
}

export const fakeStripe: FakeState = {
	intents: new Map(),
	calls: [],
	idempotent: new Map(),
	failures: [],
	nextEvent: undefined,
	searches: [],
	retrieveGate: null,
	sessions: new Map(),
	customers: new Set(),
	products: new Set(),
}

export function resetFakeStripe(): void {
	fakeStripe.intents.clear()
	fakeStripe.calls.length = 0
	fakeStripe.idempotent.clear()
	fakeStripe.failures.length = 0
	fakeStripe.nextEvent = undefined
	fakeStripe.searches.length = 0
	fakeStripe.retrieveGate = null
	fakeStripe.sessions.clear()
	fakeStripe.customers.clear()
	fakeStripe.products.clear()
}

/**
 * The payer finishes on Stripe's page: the session's card is authorized for
 * its amount, and the `checkout.session.completed` event Stripe would send
 * is returned for the test to deliver. Only manual-capture sessions exist in
 * this codebase's team flow, so the result is always a hold.
 */
export function completeCheckout(
	sessionId: string,
	options: { captureBeforeSeconds?: number } = {}
): unknown {
	const session = fakeStripe.sessions.get(sessionId)
	if (!session) throw new Error(`No such checkout session: ${sessionId}`)
	if (session.params.payment_intent_data.capture_method !== 'manual') {
		throw new Error('The fake only models manual-capture Checkout')
	}
	const paymentIntentId = `pi_${sessionId.slice('cs_'.length)}`
	addHold(
		paymentIntentId,
		session.params.line_items[0].price_data.unit_amount,
		session.params.payment_intent_data.metadata,
		options.captureBeforeSeconds
	)
	session.paymentIntentId = paymentIntentId
	return {
		id: `evt_${sessionId}`,
		type: 'checkout.session.completed',
		data: {
			object: {
				id: sessionId,
				object: 'checkout.session',
				// A manual-capture session completes unpaid: the money is held.
				payment_status: 'unpaid',
				payment_intent: paymentIntentId,
				metadata: session.params.metadata,
				customer: session.params.customer ?? null,
			},
		},
	}
}

/** Makes the next `count` retrieves of a PaymentIntent return together. */
export function gateRetrieves(paymentIntentId: string, count: number): void {
	fakeStripe.retrieveGate = { paymentIntentId, count, waiting: [] }
}

async function passGate(paymentIntentId: string): Promise<void> {
	const gate = fakeStripe.retrieveGate
	if (!gate || gate.paymentIntentId !== paymentIntentId) return
	await new Promise<void>((resolve) => {
		gate.waiting.push(resolve)
		if (gate.waiting.length >= gate.count) {
			fakeStripe.retrieveGate = null
			for (const release of gate.waiting) release()
		}
	})
}

/** A hold as Checkout leaves it: authorized, nothing captured. */
export function addHold(
	id: string,
	amount: number,
	metadata: Record<string, string>,
	captureBeforeSeconds = Math.floor(Date.now() / 1000) + 7 * 86_400
): FakePaymentIntent {
	const intent: FakePaymentIntent = {
		id,
		status: 'requires_capture',
		amount,
		amount_capturable: amount,
		amount_received: 0,
		metadata,
		latest_charge: {
			id: `ch_${id}`,
			amount_refunded: 0,
			payment_method_details: {
				card: { capture_before: captureBeforeSeconds },
			},
		},
	}
	fakeStripe.intents.set(id, intent)
	return intent
}

export function failNext(
	method: Method,
	paymentIntentId: string,
	message = 'Simulated Stripe outage'
): void {
	fakeStripe.failures.push({ method, paymentIntentId, message })
}

class StripeInvalidRequestError extends Error {
	readonly type = 'StripeInvalidRequestError'
	constructor(
		readonly code: string,
		message: string
	) {
		super(message)
	}
}

const copy = <T>(value: T): T => structuredClone(value)

function maybeFail(method: Method, paymentIntentId: string): void {
	const index = fakeStripe.failures.findIndex(
		(f) => f.method === method && f.paymentIntentId === paymentIntentId
	)
	if (index === -1) return
	const [failure] = fakeStripe.failures.splice(index, 1)
	throw new Error(failure.message)
}

function intent(id: string): FakePaymentIntent {
	const found = fakeStripe.intents.get(id)
	if (!found) {
		throw new StripeInvalidRequestError(
			'resource_missing',
			`No such payment_intent: '${id}'`
		)
	}
	return found
}

/** Replays a keyed request's first result, as Stripe does. */
function idempotent<T>(key: string | undefined, run: () => T): T {
	if (key && fakeStripe.idempotent.has(key)) {
		return copy(fakeStripe.idempotent.get(key) as T)
	}
	const result = run()
	if (key) fakeStripe.idempotent.set(key, copy(result))
	return result
}

export class FakeStripe {
	checkout = {
		sessions: {
			create: async (
				params: CheckoutSessionParams,
				options: { idempotencyKey?: string } = {}
			): Promise<{ id: string; url: string }> =>
				idempotent(options.idempotencyKey, () => {
					const id = `cs_${fakeStripe.sessions.size + 1}`
					const session: FakeCheckoutSession = {
						id,
						url: `https://checkout.stripe.com/c/pay/${id}`,
						params: copy(params),
						paymentIntentId: null,
					}
					fakeStripe.sessions.set(id, session)
					return { id, url: session.url }
				}),
		},
	}

	customers = {
		retrieve: async (id: string): Promise<{ id: string }> => {
			if (!fakeStripe.customers.has(id)) {
				throw new StripeInvalidRequestError(
					'resource_missing',
					`No such customer: '${id}'`
				)
			}
			return { id }
		},
		create: async (
			_params: unknown,
			options: { idempotencyKey?: string } = {}
		): Promise<{ id: string }> =>
			idempotent(options.idempotencyKey, () => {
				const id = `cus_${fakeStripe.customers.size + 1}`
				fakeStripe.customers.add(id)
				return { id }
			}),
	}

	products = {
		retrieve: async (id: string): Promise<{ id: string }> => {
			if (!fakeStripe.products.has(id)) {
				throw new StripeInvalidRequestError(
					'resource_missing',
					`No such product: '${id}'`
				)
			}
			return { id }
		},
		create: async (params: { id: string }): Promise<{ id: string }> => {
			fakeStripe.products.add(params.id)
			return { id: params.id }
		},
	}

	paymentIntents = {
		retrieve: async (id: string): Promise<FakePaymentIntent> => {
			maybeFail('retrieve', id)
			await passGate(id)
			return copy(intent(id))
		},

		/**
		 * Stands in for the one search the code runs: live team holds. The
		 * query is recorded so a test can assert it; results are every
		 * uncaptured PaymentIntent tagged as a team contribution, which is
		 * what that query means.
		 */
		search: (params: { query: string }): AsyncIterable<FakePaymentIntent> => {
			fakeStripe.searches.push(params.query)
			const matches = [...fakeStripe.intents.values()].filter(
				(pi) =>
					pi.status === 'requires_capture' &&
					pi.metadata.kind === 'team_contribution'
			)
			return (async function* () {
				for (const pi of matches) yield copy(pi)
			})()
		},

		capture: async (
			id: string,
			params: { amount_to_capture?: number } = {},
			options: { idempotencyKey?: string } = {}
		): Promise<FakePaymentIntent> => {
			maybeFail('capture', id)
			return idempotent(options.idempotencyKey, () => {
				const pi = intent(id)
				if (pi.status !== 'requires_capture') {
					throw new StripeInvalidRequestError(
						'payment_intent_unexpected_state',
						`This PaymentIntent could not be captured because it has a status of ${pi.status}.`
					)
				}
				const amount = params.amount_to_capture ?? pi.amount_capturable
				if (amount > pi.amount_capturable) {
					throw new StripeInvalidRequestError(
						'amount_too_large',
						'amount_to_capture exceeds the capturable amount'
					)
				}
				fakeStripe.calls.push({
					method: 'capture',
					paymentIntentId: id,
					amount,
				})
				pi.status = 'succeeded'
				pi.amount_received = amount
				pi.amount_capturable = 0
				return copy(pi)
			})
		},

		cancel: async (
			id: string,
			_params: unknown = {},
			options: { idempotencyKey?: string } = {}
		): Promise<FakePaymentIntent> => {
			maybeFail('cancel', id)
			return idempotent(options.idempotencyKey, () => {
				const pi = intent(id)
				if (pi.status !== 'requires_capture') {
					throw new StripeInvalidRequestError(
						'payment_intent_unexpected_state',
						`You cannot cancel this PaymentIntent because it has a status of ${pi.status}.`
					)
				}
				fakeStripe.calls.push({ method: 'cancel', paymentIntentId: id })
				pi.status = 'canceled'
				pi.amount_capturable = 0
				return copy(pi)
			})
		},
	}

	refunds = {
		create: async (
			params: { payment_intent: string; amount?: number },
			options: { idempotencyKey?: string } = {}
		): Promise<{ id: string; amount: number }> => {
			maybeFail('refund', params.payment_intent)
			return idempotent(options.idempotencyKey, () => {
				const pi = intent(params.payment_intent)
				if (pi.status !== 'succeeded') {
					throw new StripeInvalidRequestError(
						'charge_not_refundable',
						'This PaymentIntent has not been captured.'
					)
				}
				const refundable = pi.amount_received - pi.latest_charge.amount_refunded
				const amount = params.amount ?? refundable
				if (amount > refundable) {
					throw new StripeInvalidRequestError(
						'charge_already_refunded',
						'Refund amount exceeds what is left on the charge.'
					)
				}
				fakeStripe.calls.push({
					method: 'refund',
					paymentIntentId: pi.id,
					amount,
				})
				pi.latest_charge.amount_refunded += amount
				return { id: `re_${pi.id}_${fakeStripe.calls.length}`, amount }
			})
		},
	}

	webhooks = {
		// Signature checking is covered by webhooks.test.ts; here every
		// delivery is treated as genuine.
		constructEvent: (): unknown => {
			if (fakeStripe.nextEvent === undefined) {
				throw new Error('Set fakeStripe.nextEvent before delivering')
			}
			return fakeStripe.nextEvent
		},
	}
}
