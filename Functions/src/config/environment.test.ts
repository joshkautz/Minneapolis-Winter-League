import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Secret loading tests.
 *
 * Firebase injects only the secrets a function declares, so most secrets are
 * absent from most instances. A missing secret must be warned about only when
 * code reads it — warning about every absent secret at once filled the logs
 * of Stripe-only functions with Dropbox Sign and webhook-secret warnings.
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

/** A fresh module per test, so the warn-once bookkeeping starts empty. */
const loadEnvironment = (): Promise<typeof import('./environment.js')> =>
	import('./environment.js')

beforeEach(() => {
	vi.resetModules()
	warn.mockClear()
	for (const name of SECRET_NAMES) {
		vi.stubEnv(name, undefined)
	}
	vi.stubEnv('FUNCTIONS_EMULATOR', undefined)
	vi.stubEnv('MWL_EMULATOR_USE_DROPBOX_SIGN', undefined)
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
		const { getDropboxSignApiKey, getStripeWebhookSecret } =
			await loadEnvironment()

		expect(getDropboxSignApiKey()).toBe('DEVELOPMENT_PLACEHOLDER_DROPBOX')
		expect(getStripeWebhookSecret()).toBe(
			'DEVELOPMENT_PLACEHOLDER_STRIPE_WEBHOOK'
		)
		expect(warn).toHaveBeenCalledTimes(2)
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('DROPBOX_SIGN_API_KEY is required')
		)
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
		const { getDropboxSignApiKey } = await loadEnvironment()
		vi.stubEnv('DROPBOX_SIGN_API_KEY', 'dbx_set_after_import')

		expect(getDropboxSignApiKey()).toBe('dbx_set_after_import')
		expect(warn).not.toHaveBeenCalled()
	})
})

/**
 * The emulator runs against the production project, and fetches any secret
 * missing from Functions/.secret.local from production Secret Manager. On 24
 * September 2026 that let a seeded emulator email ten real waiver requests.
 */
describe('getSecret under the emulator', () => {
	beforeEach(() => {
		vi.stubEnv('FUNCTIONS_EMULATOR', 'true')
	})

	it('refuses the Dropbox Sign key unless opted in', async () => {
		vi.stubEnv('DROPBOX_SIGN_API_KEY', 'dbx_production_key')
		const { getDropboxSignApiKey, isDropboxSignDisabledInEmulator } =
			await loadEnvironment()

		expect(isDropboxSignDisabledInEmulator()).toBe(true)
		expect(getDropboxSignApiKey()).toBe('DEVELOPMENT_PLACEHOLDER_DROPBOX')
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('MWL_EMULATOR_USE_DROPBOX_SIGN=true')
		)
	})

	it('uses the Dropbox Sign key when opted in', async () => {
		vi.stubEnv('DROPBOX_SIGN_API_KEY', 'dbx_key')
		vi.stubEnv('MWL_EMULATOR_USE_DROPBOX_SIGN', 'true')
		const { getDropboxSignApiKey, isDropboxSignDisabledInEmulator } =
			await loadEnvironment()

		expect(isDropboxSignDisabledInEmulator()).toBe(false)
		expect(getDropboxSignApiKey()).toBe('dbx_key')
		expect(warn).not.toHaveBeenCalled()
	})

	it.each(['sk_live_abc', 'rk_live_abc'])(
		'never uses a live Stripe key (%s)',
		async (liveKey) => {
			vi.stubEnv('STRIPE_SECRET_KEY', liveKey)
			const { getStripeSecretKey } = await loadEnvironment()

			expect(getStripeSecretKey()).toBe('DEVELOPMENT_PLACEHOLDER_STRIPE')
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining('live Stripe key')
			)
		}
	)

	it('uses a test-mode Stripe key', async () => {
		vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_abc')
		const { getStripeSecretKey } = await loadEnvironment()

		expect(getStripeSecretKey()).toBe('sk_test_abc')
		expect(warn).not.toHaveBeenCalled()
	})

	it('warns about a refused secret once, not on every read', async () => {
		vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_abc')
		const { getStripeSecretKey } = await loadEnvironment()

		getStripeSecretKey()
		getStripeSecretKey()

		expect(warn).toHaveBeenCalledTimes(1)
	})

	it('leaves deployed functions alone', async () => {
		vi.stubEnv('FUNCTIONS_EMULATOR', undefined)
		vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_abc')
		vi.stubEnv('DROPBOX_SIGN_API_KEY', 'dbx_production_key')
		const { getDropboxSignApiKey, getStripeSecretKey } = await loadEnvironment()

		expect(getStripeSecretKey()).toBe('sk_live_abc')
		expect(getDropboxSignApiKey()).toBe('dbx_production_key')
	})
})
