import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The provider configs hand out secrets through getters, so a function reads
 * — and is warned about — only the secrets it touches. The Stripe cases
 * reproduce the production log noise: `reconcileTeamPaymentsDaily` declares
 * only STRIPE_SECRET_KEY, and building its Stripe client warned about both
 * STRIPE_WEBHOOK_SECRET and DROPBOX_SIGN_API_KEY.
 */

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))

vi.mock('firebase-functions/v2', () => ({
	logger: { warn },
}))

const SECRET_NAMES = [
	'DROPBOX_SIGN_API_KEY',
	'STRIPE_SECRET_KEY',
	'STRIPE_WEBHOOK_SECRET',
] as const

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

describe('getDropboxSignConfig', () => {
	it('reads no secret until the API key is accessed', async () => {
		const { getDropboxSignConfig } = await loadConstants()

		const config = getDropboxSignConfig()

		expect(config.TEMPLATE_ID).toBe('2ea9b881ec6798e7c6122ebaa51baf50689c573c')
		expect(config.TEST_MODE).toBe(true)
		expect(warn).not.toHaveBeenCalled()
	})

	it('warns and returns the placeholder when the missing API key is read', async () => {
		const { getDropboxSignConfig } = await loadConstants()

		expect(getDropboxSignConfig().API_KEY).toBe(
			'DEVELOPMENT_PLACEHOLDER_DROPBOX'
		)
		expect(warn).toHaveBeenCalledTimes(1)
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('DROPBOX_SIGN_API_KEY is required')
		)
	})

	it('returns a present API key without warning', async () => {
		vi.stubEnv('DROPBOX_SIGN_API_KEY', 'dbx_present')
		const { getDropboxSignConfig } = await loadConstants()

		expect(getDropboxSignConfig().API_KEY).toBe('dbx_present')
		expect(warn).not.toHaveBeenCalled()
	})

	it('turns test mode off in production', async () => {
		vi.stubEnv('NODE_ENV', 'production')
		const { getDropboxSignConfig } = await loadConstants()

		expect(getDropboxSignConfig().TEST_MODE).toBe(false)
	})
})
