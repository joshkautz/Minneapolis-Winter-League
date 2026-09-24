/**
 * Environment variable configuration and validation
 */

import { logger } from 'firebase-functions/v2'

interface EnvironmentConfig {
	nodeEnv: string
	isProduction: boolean
	isDevelopment: boolean
}

/**
 * Loads the non-secret runtime environment.
 * This should be called only when needed, not at module load time
 */
export function getEnvironmentConfig(): EnvironmentConfig {
	const nodeEnv = process.env.NODE_ENV || 'development'
	return {
		nodeEnv,
		isProduction: nodeEnv === 'production',
		isDevelopment: nodeEnv === 'development',
	}
}

let _envConfig: EnvironmentConfig | null = null

/**
 * Global environment configuration instance (lazy-loaded)
 */
export function getENV(): EnvironmentConfig {
	if (!_envConfig) {
		_envConfig = getEnvironmentConfig()
	}
	return _envConfig
}

export type SecretName =
	'DROPBOX_SIGN_API_KEY' | 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET'

/**
 * Returned in place of a missing secret so functions still load without one.
 * A function that uses the placeholder fails at the provider instead.
 */
const SECRET_PLACEHOLDERS: Record<SecretName, string> = {
	DROPBOX_SIGN_API_KEY: 'DEVELOPMENT_PLACEHOLDER_DROPBOX',
	STRIPE_SECRET_KEY: 'DEVELOPMENT_PLACEHOLDER_STRIPE',
	STRIPE_WEBHOOK_SECRET: 'DEVELOPMENT_PLACEHOLDER_STRIPE_WEBHOOK',
}

const warnedMissingSecrets = new Set<SecretName>()
const warnedRefusedSecrets = new Set<SecretName>()

/** The Functions emulator sets this; a deployed function never sees it. */
export function isRunningInEmulator(): boolean {
	return process.env.FUNCTIONS_EMULATOR === 'true'
}

/** Set to `true` to let the emulator call Dropbox Sign; see below. */
export const EMULATOR_DROPBOX_SIGN_OPT_IN = 'MWL_EMULATOR_USE_DROPBOX_SIGN'

/**
 * Whether Dropbox Sign is off because this is the emulator. It is off by
 * default there: every seeded roster entry fires `onRosterEntryCreated`,
 * which emails a real waiver request to that player's real address.
 */
export function isDropboxSignDisabledInEmulator(): boolean {
	return (
		isRunningInEmulator() &&
		process.env[EMULATOR_DROPBOX_SIGN_OPT_IN] !== 'true'
	)
}

/**
 * Why the emulator must not use a secret it was given, or null if it may.
 *
 * The emulator runs against the production project, and a secret missing
 * from `Functions/.secret.local` is fetched from production Secret Manager
 * with the developer's own credentials. On 24 September 2026 that sent ten
 * real waiver emails to seed addresses while testing a button. So the
 * emulator never uses a live Stripe key, and uses Dropbox Sign only when a
 * developer opts in.
 */
function emulatorRefusal(name: SecretName, value: string): string | null {
	if (!isRunningInEmulator()) return null
	if (name === 'DROPBOX_SIGN_API_KEY' && isDropboxSignDisabledInEmulator()) {
		return `Dropbox Sign is off under the emulator, so seeding cannot email real players. Set ${EMULATOR_DROPBOX_SIGN_OPT_IN}=true to opt in.`
	}
	if (
		name === 'STRIPE_SECRET_KEY' &&
		(value.startsWith('sk_live_') || value.startsWith('rk_live_'))
	) {
		return 'A live Stripe key is never used under the emulator. Put a test-mode key in Functions/.secret.local.'
	}
	return null
}

/**
 * Reads one secret at the moment it is needed.
 *
 * Firebase injects only the secrets listed in a function's `secrets` option,
 * so every other secret is legitimately absent from that instance. Checking
 * them all together logged a warning for each undeclared one on every cold
 * start; checking per read means a warning points at a secret some code
 * actually tried to use. It is logged once per instance, not per read.
 *
 * In production the value is a Firebase secret; under the emulator it comes
 * from `Functions/.secret.local`, or from production Secret Manager when it
 * is not there — which is why the emulator refuses some of them.
 */
export function getSecret(name: SecretName): string {
	const value = process.env[name]
	if (value) {
		const refusal = emulatorRefusal(name, value)
		if (refusal === null) {
			return value
		}
		if (!warnedRefusedSecrets.has(name)) {
			warnedRefusedSecrets.add(name)
			logger.warn(`${name} refused: ${refusal}`)
		}
		return SECRET_PLACEHOLDERS[name]
	}
	if (!warnedMissingSecrets.has(name)) {
		warnedMissingSecrets.add(name)
		logger.warn(
			`${name} is required (set via Firebase secret or .secret.local)`
		)
	}
	return SECRET_PLACEHOLDERS[name]
}

export function getDropboxSignApiKey(): string {
	return getSecret('DROPBOX_SIGN_API_KEY')
}

export function getStripeSecretKey(): string {
	return getSecret('STRIPE_SECRET_KEY')
}

export function getStripeWebhookSecret(): string {
	return getSecret('STRIPE_WEBHOOK_SECRET')
}
