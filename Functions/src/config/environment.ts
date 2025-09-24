/**
 * Environment variable configuration and validation
 */

import { logger } from 'firebase-functions/v2'

interface EnvironmentConfig {
	dropboxSignApiKey: string
	stripeSecretKey: string
	nodeEnv: string
	isProduction: boolean
	isDevelopment: boolean
}

/**
 * Validates and loads environment variables/secrets
 * This should be called only when needed, not at module load time
 */
export function getEnvironmentConfig(): EnvironmentConfig {
	const nodeEnv = process.env.NODE_ENV || 'development'
	const dropboxSignApiKey = process.env.DROPBOX_SIGN_API_KEY
	const stripeSecretKey = process.env.STRIPE_SECRET_KEY

	// In production, secrets are injected as environment variables by Firebase
	// In development, they come from .secret.local file (loaded by emulator)
	if (!dropboxSignApiKey) {
		const error =
			'DROPBOX_SIGN_API_KEY is required (set via Firebase secret or .secret.local)'
		logger.warn(error)
		// Don't throw to allow functions to load even without secrets
		// Functions that need the secret will fail at runtime instead
	}

	if (!stripeSecretKey) {
		const error =
			'STRIPE_SECRET_KEY is required (set via Firebase secret or .secret.local)'
		logger.warn(error)
		// Don't throw to allow functions to load even without secrets
		// Functions that need the secret will fail at runtime instead
	}

	return {
		dropboxSignApiKey: dropboxSignApiKey || 'DEVELOPMENT_PLACEHOLDER_DROPBOX',
		stripeSecretKey: stripeSecretKey || 'DEVELOPMENT_PLACEHOLDER_STRIPE',
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
