import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The provider configs hand out secrets through getters, so a function reads
 * — and is warned about — only the secrets it touches. The Stripe cases
 * reproduce the production log noise: `reconcileTeamPaymentsDaily` declares
 * only STRIPE_SECRET_KEY, and building its Stripe client warned about the
 * STRIPE_WEBHOOK_SECRET it was never given.
 */

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))

vi.mock('firebase-functions/v2', () => ({
	logger: { warn },
}))

const SECRET_NAMES = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const

/** A fresh module graph per test, so the warn-once bookkeeping starts empty. */
const loadConstants = (): Promise<typeof import('./constants.js')> =>
	import('./constants.js')

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

describe('getStripeConfig', () => {
	it('reads no secret until a secret field is accessed', async () => {
		const { getStripeConfig } = await loadConstants()

		expect(getStripeConfig().API_VERSION).toBe('2026-08-26.dahlia')
		expect(warn).not.toHaveBeenCalled()
	})

	it('does not warn about the webhook secret when only the secret key is declared and read', async () => {
		vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_present')
		const { getStripeConfig } = await loadConstants()

		const config = getStripeConfig()

		expect(config.SECRET_KEY).toBe('sk_live_present')
		expect(config.API_VERSION).toBe('2026-08-26.dahlia')
		expect(warn).not.toHaveBeenCalled()
	})

	it('warns about the webhook secret when it is missing and read', async () => {
		vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_present')
		const { getStripeConfig } = await loadConstants()

		expect(getStripeConfig().WEBHOOK_SECRET).toBe(
			'DEVELOPMENT_PLACEHOLDER_STRIPE_WEBHOOK'
		)
		expect(warn).toHaveBeenCalledTimes(1)
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('STRIPE_WEBHOOK_SECRET is required')
		)
	})

	it('returns both secrets without warning when both are present', async () => {
		vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_present')
		vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_present')
		const { getStripeConfig } = await loadConstants()

		const config = getStripeConfig()

		expect(config.SECRET_KEY).toBe('sk_live_present')
		expect(config.WEBHOOK_SECRET).toBe('whsec_present')
		expect(warn).not.toHaveBeenCalled()
	})
})
