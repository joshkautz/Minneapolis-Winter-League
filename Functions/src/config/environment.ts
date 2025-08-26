/**
 * Environment variable configuration and validation
 */

import { logger } from 'firebase-functions/v2'

interface EnvironmentConfig {
	dropboxSignApiKey: string
	nodeEnv: string
	isProduction: boolean
	isDevelopment: boolean
}

/**
 * Validates and loads environment variables
 */
export function getEnvironmentConfig(): EnvironmentConfig {
	const nodeEnv = process.env.NODE_ENV || 'development'
	const dropboxSignApiKey = process.env.DROPBOX_SIGN_API_KEY

	// In development, allow fallback to placeholder
	if (!dropboxSignApiKey && nodeEnv === 'production') {
		const error = 'DROPBOX_SIGN_API_KEY environment variable is required in production'
		logger.error(error)
		throw new Error(error)
	}

	return {
		dropboxSignApiKey: dropboxSignApiKey || 'DROPBOX_SIGN_API_KEY',
		nodeEnv,
		isProduction: nodeEnv === 'production',
		isDevelopment: nodeEnv === 'development',
	}
}

/**
 * Global environment configuration instance
 */
export const ENV = getEnvironmentConfig()
