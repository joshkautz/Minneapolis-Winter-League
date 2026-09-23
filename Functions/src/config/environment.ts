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
 * from `Functions/.secret.local`.
 */
export function getSecret(name: SecretName): string {
	const value = process.env[name]
	if (value) {
		return value
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
