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
}

export const fakeStripe: FakeState = {
	intents: new Map(),
	calls: [],
	idempotent: new Map(),
	failures: [],
	nextEvent: undefined,
	retrieveGate: null,
}

export function resetFakeStripe(): void {
	fakeStripe.intents.clear()
	fakeStripe.calls.length = 0
	fakeStripe.idempotent.clear()
	fakeStripe.failures.length = 0
	fakeStripe.nextEvent = undefined
	fakeStripe.retrieveGate = null
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
	paymentIntents = {
		retrieve: async (id: string): Promise<FakePaymentIntent> => {
			maybeFail('retrieve', id)
			await passGate(id)
			return copy(intent(id))
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
