import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Secret loading tests.
 *
 * Firebase injects only the secrets a function declares, so most secrets are
 * absent from most instances. A missing secret must be warned about only when
 * code reads it — warning about every absent secret at once filled the logs
 * of Stripe-only functions with warnings for secrets they never use.
 */

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))

vi.mock('firebase-functions/v2', () => ({
	logger: { warn },
}))

const SECRET_NAMES = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const

/** A fresh module per test, so the warn-once bookkeeping starts empty. */
const loadEnvironment = (): Promise<typeof import('./environment.js')> =>
	import('./environment.js')

beforeEach(() => {
	vi.resetModules()
	warn.mockClear()
	for (const name of SECRET_NAMES) {
		vi.stubEnv(name, undefined)
	}
})

afterEach(() => {
	vi.unstubAllEnvs()
})

describe('getSecret', () => {
	it('returns a present secret without warning', async () => {
		vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_present')
		const { getStripeSecretKey } = await loadEnvironment()

		expect(getStripeSecretKey()).toBe('sk_live_present')
		expect(warn).not.toHaveBeenCalled()
	})

	it('does not warn about missing secrets that are never read', async () => {
		vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_present')
		const { getStripeSecretKey } = await loadEnvironment()

		getStripeSecretKey()

		expect(warn).not.toHaveBeenCalled()
	})

	it('warns, naming the secret, and returns the placeholder when a missing one is read', async () => {
		const { getStripeWebhookSecret } = await loadEnvironment()

		expect(getStripeWebhookSecret()).toBe(
			'DEVELOPMENT_PLACEHOLDER_STRIPE_WEBHOOK'
		)
		expect(warn).toHaveBeenCalledTimes(1)
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('STRIPE_WEBHOOK_SECRET is required')
		)
	})

	it('returns the Stripe placeholder for a missing secret key', async () => {
		const { getStripeSecretKey } = await loadEnvironment()

		expect(getStripeSecretKey()).toBe('DEVELOPMENT_PLACEHOLDER_STRIPE')
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('STRIPE_SECRET_KEY is required')
		)
	})

	it('treats an empty value as missing', async () => {
		vi.stubEnv('STRIPE_SECRET_KEY', '')
		const { getStripeSecretKey } = await loadEnvironment()

		expect(getStripeSecretKey()).toBe('DEVELOPMENT_PLACEHOLDER_STRIPE')
		expect(warn).toHaveBeenCalledTimes(1)
	})

	it('warns once per missing secret per instance, not on every read', async () => {
		const { getStripeSecretKey, getStripeWebhookSecret } =
			await loadEnvironment()

		getStripeSecretKey()
		getStripeSecretKey()
		expect(warn).toHaveBeenCalledTimes(1)

		getStripeWebhookSecret()
		expect(warn).toHaveBeenCalledTimes(2)
	})

	it('reads the environment at call time, not at import', async () => {
		const { getStripeWebhookSecret } = await loadEnvironment()
		vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_set_after_import')

		expect(getStripeWebhookSecret()).toBe('whsec_set_after_import')
		expect(warn).not.toHaveBeenCalled()
	})
})
